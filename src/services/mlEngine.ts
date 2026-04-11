import { CartolaData, CartolaMatches, FBrefClubStats } from '../types';
import fbrefDataRaw from '../data/fbref_data.json';

const fbrefData = fbrefDataRaw as Record<string, FBrefClubStats>;

export interface MLWeights {
  homeAdvantage: number;
  positionMultipliers: Record<number, number>;
  defenseForm: number; // Peso da defesa adversária
  attackForm: number; // Peso do ataque do time
}

export interface PlayerProjection {
  atleta_id: number;
  apelido: string;
  posicao_id: number;
  clube_id: number;
  foto: string;
  media_base: number;
  expected_points: number;
  confidence: number; // 0-1: quão confiante estamos na projeção
  ceiling: number; // Teto estimado (percentil 85)
  floor: number; // Piso estimado (percentil 15)
  rodada: number;
}

export interface MLEvaluation {
  rodada: number;
  mae: number; // Mean Absolute Error
  details: {
    atleta_id: number;
    apelido: string;
    expected: number;
    actual: number;
    error: number;
  }[];
  adjustments: string[];
}

const STORAGE_KEYS = {
  WEIGHTS: 'cartola_ml_weights',
  PROJECTIONS: 'cartola_ml_projections_v2_',
  EVALUATIONS: 'cartola_ml_evaluations_v2_'
};

const DEFAULT_WEIGHTS: MLWeights = {
  homeAdvantage: 1.15,
  positionMultipliers: {
    1: 1.0, // GOL
    2: 1.0, // LAT
    3: 1.0, // ZAG
    4: 1.0, // MEI
    5: 1.0, // ATA
    6: 1.0, // TEC
  },
  defenseForm: 1.0,
  attackForm: 1.0
};

// Helper: load weights
export const getWeights = (): MLWeights => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.WEIGHTS);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error("Error loading ML weights", e);
  }
  return DEFAULT_WEIGHTS;
};

// Helper: save weights
export const saveWeights = (weights: MLWeights) => {
  localStorage.setItem(STORAGE_KEYS.WEIGHTS, JSON.stringify(weights));
};

export const getProjections = (rodada: number): PlayerProjection[] | null => {
  const raw = localStorage.getItem(`${STORAGE_KEYS.PROJECTIONS}${rodada}`);
  if (raw) return JSON.parse(raw);
  return null;
};

export const getEvaluation = (rodada: number): MLEvaluation | null => {
  const raw = localStorage.getItem(`${STORAGE_KEYS.EVALUATIONS}${rodada}`);
  if (raw) return JSON.parse(raw);
  return null;
};

// Gera as projeções matemáticas para a rodada atual
export const generateProjections = (
  data: CartolaData,
  matches: CartolaMatches
): PlayerProjection[] => {
  const weights = getWeights();
  const validMatches = matches.partidas.filter((m) => m.valida);
  const projections: PlayerProjection[] = [];

  // Cria um index rápido de oponentes
  const opponentMap: Record<number, { isHome: boolean; opponentId: number }> = {};
  validMatches.forEach(m => {
    opponentMap[m.clube_casa_id] = { isHome: true, opponentId: m.clube_visitante_id };
    opponentMap[m.clube_visitante_id] = { isHome: false, opponentId: m.clube_casa_id };
  });

  // Filtramos jogadores prováveis (status 7) e dúvidas (status 2)
  const probables = data.atletas.filter((p) => (p.status_id === 7 || p.status_id === 2) && p.jogos_num > 0);

  probables.forEach((p) => {
    // Ignora técnicos na primeira passada, pois eles dependem da projeção dos outros jogadores
    if (p.posicao_id === 6) return;

    const matchData = opponentMap[p.clube_id];
    if (!matchData) return; // Não tem partida válida

    // Começamos o cálculo pela média base do jogador (preferindo a média por scouts quando disponível)
    let expected = p.media_base_scout || p.media_num;

    // --- Fator Mando de Campo (usando home/away splits reais do FBref) ---
    const myClubAbrv = data.clubes[p.clube_id]?.abreviacao;
    const oppClubAbrv = data.clubes[matchData.opponentId]?.abreviacao;
    const myFbref = fbrefData[myClubAbrv];
    const oppFbref = fbrefData[oppClubAbrv];

    if (myFbref?.home_away) {
      const ha = myFbref.home_away;
      const hg = ha.home_games || 0;
      const ag = ha.away_games || 0;
      const hpa = ha.home_points_avg || 0;
      const apa = ha.away_points_avg || 0;
      const totalGames = hg + ag;
      if (totalGames > 0 && (hg > 0 && ag > 0)) {
        // Usa diferencial (não ratio!) para evitar inflação em times desequilibrados casa/fora
        // Ex: Flu tem 3.0 casa / 1.0 fora → avg 2.0 → diff casa = +1.0 → boost = +1.0 * 0.04 = +4%
        const overallPtsAvg = (hpa * hg + apa * ag) / totalGames;
        const relevantPtsAvg = matchData.isHome ? hpa : apa;
        const diff = relevantPtsAvg - overallPtsAvg;
        const homeAwayFactor = 1 + diff * 0.04; // ±4% por ponto de diferença
        expected *= Math.max(0.88, Math.min(1.12, homeAwayFactor));
      } else {
        expected *= matchData.isHome ? weights.homeAdvantage : (2 - weights.homeAdvantage);
      }
    } else {
      expected *= matchData.isHome ? weights.homeAdvantage : (2 - weights.homeAdvantage);
    }

    // --- Fator Momento do Time (last_5 + points_avg) ---
    if (myFbref?.overall?.last_5) {
      const last5 = myFbref.overall.last_5 as string;
      const wins = (last5.match(/W/g) || []).length;
      const losses = (last5.match(/L/g) || []).length;
      expected *= 1 + (wins - losses) * 0.02; // até ±10%
    }

    // --- MATCHUP ADITIVO (evita acúmulo exponencial de multiplicadores) ---
    // Cada fator soma um bônus/penalidade ao matchupBonus, que é aplicado UMA vez no final
    let matchupBonus = 0;

    if (oppFbref && myFbref) {
      const myGames = myFbref.overall?.games || 10;
      const oppGames = oppFbref.overall?.games || 10;

      // 1. Goleiros (GOL)
      if (p.posicao_id === 1) {
        const oppSoT = (oppFbref.shooting?.for?.shots_on_target || 40) / oppGames;
        const mySavePct = (myFbref.keepers?.for?.gk_save_pct || 70) / 100;
        // Mais chutes adversários = mais defesas (DE)
        const savePotential = (oppSoT / 4.2) * mySavePct;
        matchupBonus += (savePotential - 1) * 0.10;

        // SG opportunity: adversário faz poucos gols
        const oppGoalsPer90 = oppFbref.standard?.for?.goals_per90 || 1.2;
        const myCSPct = (myFbref.keepers?.for?.gk_clean_sheets_pct || 20) / 100;
        if (oppGoalsPer90 < 1.0) matchupBonus += myCSPct * 0.10;

        // Adversário desperdiça finalizações
        const oppConversion = oppFbref.shooting?.for?.goals_per_shot_on_target || 0.3;
        if (oppConversion < 0.25) matchupBonus += 0.03;
      }

      // 2. Defensores (ZAG/LAT)
      if (p.posicao_id === 2 || p.posicao_id === 3) {
        // Desarmes: adversário perde muita posse
        const oppTacklesConceded = (oppFbref.misc?.against?.tackles_won || 80) / oppGames;
        const myTackles = (myFbref.misc?.for?.tackles_won || 80) / myGames;
        if (oppTacklesConceded > 9.5) matchupBonus += 0.04;
        if (myTackles > 9.5) matchupBonus += 0.03;

        // Interceptações do meu time
        const myInt = (myFbref.misc?.for?.interceptions || 60) / myGames;
        if (myInt > 7) matchupBonus += 0.03;

        // SG opportunity: adversário faz poucos gols
        const oppGoalsPer90 = oppFbref.standard?.for?.goals_per90 || 1.2;
        if (oppGoalsPer90 < 1.0) matchupBonus += 0.06;
        else if (oppGoalsPer90 < 1.2) matchupBonus += 0.03;

        // Clean sheet % do meu time
        const myCSPct = myFbref.keepers?.for?.gk_clean_sheets_pct || 20;
        matchupBonus += (myCSPct - 20) / 100 * 0.05;

        // Laterais: cruzamentos
        if (p.posicao_id === 2) {
          const myCrosses = (myFbref.misc?.for?.crosses || 100) / myGames;
          if (myCrosses > 12) matchupBonus += 0.03;
        }
      }

      // 3. Meias (MEI)
      if (p.posicao_id === 4) {
        // Adversário comete muitas faltas (FS)
        const oppFouls = (oppFbref.misc?.for?.fouls || 130) / oppGames;
        if (oppFouls > 15) matchupBonus += 0.05;
        else if (oppFouls > 13) matchupBonus += 0.03;

        // Adversário perde muita posse (DS)
        const oppTacklesConceded = (oppFbref.misc?.against?.tackles_won || 80) / oppGames;
        if (oppTacklesConceded > 9.5) matchupBonus += 0.04;

        // Posse de bola = mais tempo efetivo
        const myPossession = myFbref.possession?.for?.possession || myFbref.standard?.for?.possession || 50;
        matchupBonus += (myPossession - 50) * 0.002;

        // Meu time finaliza muito = meias criam
        const mySoT = (myFbref.shooting?.for?.shots_on_target || 40) / myGames;
        if (mySoT > 4.5) matchupBonus += 0.02;
      }

      // 4. Atacantes (ATA)
      if (p.posicao_id === 5) {
        // Acurácia de finalização × fraqueza do GK adversário
        const myShotAcc = (myFbref.shooting?.for?.shots_on_target_pct || 33) / 100;
        const oppGkSavePct = (oppFbref.keepers?.for?.gk_save_pct || 70) / 100;
        const goalProbability = myShotAcc * (1.5 - oppGkSavePct);
        matchupBonus += goalProbability * 0.20;

        // Adversário sofre muitos gols
        const oppGAPer90 = oppFbref.keepers?.for?.gk_goals_against_per90 || 1.2;
        if (oppGAPer90 > 1.5) matchupBonus += 0.07;
        else if (oppGAPer90 > 1.3) matchupBonus += 0.04;

        // Adversário toma muitos chutes (defesa porosa)
        const oppShotsAgainst = (oppFbref.shooting?.against?.shots_on_target || 40) / oppGames;
        if (oppShotsAgainst > 4.5) matchupBonus += 0.03;

        // Adversário tem poucos desarmes
        const oppTackles = (oppFbref.misc?.for?.tackles_won || 80) / oppGames;
        if (oppTackles < 7.5) matchupBonus += 0.03;

        // Cruzamentos do meu time
        const myCrosses = (myFbref.misc?.for?.crosses || 100) / myGames;
        if (myCrosses > 14) matchupBonus += 0.02;
      }
    }

    // --- Perfil de Scout Individual do Jogador (acumula no mesmo matchupBonus) ---
    const games = p.jogos_num > 0 ? p.jogos_num : 1;
    if (p.scout) {
      // === BÔNUS POSITIVOS baseados no scout acumulado ===

      // Goleadores: jogadores com alta taxa de gol recebem boost proporcional à fraqueza do adversário
      if ([4, 5].includes(p.posicao_id)) {
        const goalsPerGame = (p.scout.G || 0) / games;
        if (goalsPerGame > 0.3) matchupBonus += 0.03; // Artilheiro consistente
      }

      // Assistentes: jogadores com alta taxa de assistência
      if ([2, 4, 5].includes(p.posicao_id)) {
        const assistsPerGame = (p.scout.A || 0) / games;
        if (assistsPerGame > 0.2) matchupBonus += 0.02;
      }

      // Finalizadores: FD+FT valem muito (1.2 e 3.0 pts respectivamente)
      if ([4, 5].includes(p.posicao_id)) {
        const fdPerGame = (p.scout.FD || 0) / games; // Finalização defendida: +1.2pts
        const ftPerGame = (p.scout.FT || 0) / games; // Finalização na trave: +3.0pts!
        if (fdPerGame > 0.5) matchupBonus += 0.01;
        if (ftPerGame > 0.15) matchupBonus += 0.02; // FT vale muito no Cartola
      }

      // Desarme alto: jogadores que desarmam muito individualmente
      if ([2, 3, 4].includes(p.posicao_id)) {
        const dsPerGame = (p.scout.DS || 0) / games;
        if (dsPerGame > 1.5) matchupBonus += 0.02;
      }

      // Defesas (goleiros): alta taxa de DE individual
      if (p.posicao_id === 1) {
        const dePerGame = (p.scout.DE || 0) / games;
        if (dePerGame > 2.5) matchupBonus += 0.03;
      }

      // Caça-Faltas individual: FS gera 0.5pts passivos
      if ([4, 5].includes(p.posicao_id)) {
        const fsPerGame = (p.scout.FS || 0) / games;
        if (fsPerGame > 1.5) matchupBonus += 0.02;
      }

      // Vitórias: scout V indica time vencedor → bônus indireto de +1pt por vitória
      const vPerGame = (p.scout.V || 0) / games;
      if (vPerGame > 0.5) matchupBonus += 0.01; // Time que vence bastante

      // === PENALIDADES baseadas em scouts negativos ===
      const gsPerGame = (p.scout.GS || 0) / games;
      const caPerGame = (p.scout.CA || 0) / games;
      const fcPerGame = (p.scout.FC || 0) / games;
      const cvPerGame = ((p.scout.CV || 0) + (p.scout.CR || 0)) / games;
      const gcPerGame = (p.scout.GC || 0) / games;
      const ppPerGame = (p.scout.PP || 0) / games;
      const iPerGame = (p.scout.I || 0) / games;
      const pcPerGame = (p.scout.PC || 0) / games;

      // Gol sofrido (GOL/ZAG/LAT) — muito impactante (-1.0pt cada)
      if (gsPerGame > 1.5 && [1, 2, 3].includes(p.posicao_id)) matchupBonus -= 0.04;

      // Cartão amarelo alto = risco de expulsão + perda de -1.0pt
      if (caPerGame > 0.4) matchupBonus -= 0.03;

      // Cartão vermelho: -3.0pts + sai do jogo
      if (cvPerGame > 0.05) matchupBonus -= 0.04;

      // Falta cometida alta (-0.3pt cada)
      if (fcPerGame > 2.0) matchupBonus -= 0.02;

      // Gol contra: -3.0pts (raro mas catastrófico)
      if (gcPerGame > 0.05) matchupBonus -= 0.02;

      // Pênalti perdido: -4.0pts (catastrófico)
      if (ppPerGame > 0.05) matchupBonus -= 0.03;

      // Pênalti cometido: -1.0pt
      if (pcPerGame > 0.1) matchupBonus -= 0.02;

      // Impedimento: -0.1pt (baixo impacto mas indica posicionamento ruim)
      if (iPerGame > 0.5) matchupBonus -= 0.01;
    }

    // Aplica matchup bonus total (FBref + scout individual) com cap ±18%
    matchupBonus = Math.max(-0.18, Math.min(0.18, matchupBonus));
    expected *= (1 + matchupBonus);

    // Aplica o Peso Dinâmico Aprendido da Posição
    const posMultiplier = weights.positionMultipliers[p.posicao_id] || 1.0;
    expected *= posMultiplier;

    // Limites de segurança
    if (expected < 0) expected = 0.5;
    if (expected > 20) expected = 20;

    // --- Cálculo de Confiança ---
    // Quanto mais fatores positivos alinham, mais confiança na projeção
    let confidence = 0.5; // Base: 50%

    // Mais jogos = mais dados = mais confiança
    confidence += Math.min(0.15, games / 30 * 0.15);

    // Matchup claro (bônus forte ou penalidade forte) = mais confiança na direção
    confidence += Math.min(0.10, Math.abs(matchupBonus) * 0.5);

    // Time em boa forma = padrão mais previsível
    if (myFbref?.overall?.last_5) {
      const last5 = myFbref.overall.last_5 as string;
      const consistent = (last5.match(/W/g) || []).length >= 4 || (last5.match(/L/g) || []).length >= 4;
      if (consistent) confidence += 0.10; // Time com padrão claro
    }

    // Jogador sem scouts negativos excessivos = mais previsível
    if (p.scout) {
      const totalNegatives = (p.scout.CA || 0) + (p.scout.CV || 0) + (p.scout.CR || 0) + (p.scout.GC || 0);
      const negPerGame = totalNegatives / games;
      if (negPerGame < 0.3) confidence += 0.05;
      else if (negPerGame > 1.0) confidence -= 0.10;
    }

    confidence = Math.max(0.15, Math.min(0.95, confidence));

    // Floor/Ceiling: baseado na média ± desvio estimado
    const estimatedStdDev = expected * (1 - confidence) * 1.5;
    const ceiling = Math.round((expected + estimatedStdDev) * 100) / 100;
    const floor = Math.round(Math.max(0, expected - estimatedStdDev) * 100) / 100;

    projections.push({
      atleta_id: p.atleta_id,
      apelido: p.apelido,
      posicao_id: p.posicao_id,
      clube_id: p.clube_id,
      foto: p.foto,
      media_base: p.media_num,
      rodada: matches.rodada,
      expected_points: Math.round(expected * 100) / 100,
      confidence: Math.round(confidence * 100) / 100,
      ceiling,
      floor
    });
  });

  // Calcula técnicos
  probables.filter((p) => p.posicao_id === 6).forEach((coach) => {
    const teamProjections = projections.filter(t => t.clube_id === coach.clube_id);
    let expected = 0;
    if (teamProjections.length > 0) {
       const sum = teamProjections.reduce((acc, t) => acc + t.expected_points, 0);
       expected = sum / teamProjections.length;
    } else {
       expected = coach.media_num;
    }
    const posMultiplier = weights.positionMultipliers[coach.posicao_id] || 1.0;
    expected *= posMultiplier;

    // Confiança do técnico: média da confiança dos jogadores do time
    const teamConfidence = teamProjections.length > 0
      ? teamProjections.reduce((acc, t) => acc + t.confidence, 0) / teamProjections.length
      : 0.4;

    projections.push({
      atleta_id: coach.atleta_id,
      apelido: coach.apelido,
      posicao_id: coach.posicao_id,
      clube_id: coach.clube_id,
      foto: coach.foto,
      media_base: coach.media_num,
      rodada: matches.rodada,
      expected_points: Math.round(expected * 100) / 100,
      confidence: Math.round(teamConfidence * 100) / 100,
      ceiling: Math.round(expected * 1.3 * 100) / 100,
      floor: Math.round(Math.max(0, expected * 0.7) * 100) / 100
    });
  });

  localStorage.setItem(`${STORAGE_KEYS.PROJECTIONS}${matches.rodada}`, JSON.stringify(projections));
  return projections;
};

export const evaluateRound = (
  rodada: number, 
  pontuados: Record<number, any>, 
  data: CartolaData
): MLEvaluation | null => {
  const projections = getProjections(rodada);
  if (!projections || Object.keys(pontuados).length === 0) return null;

  let totalError = 0;
  let count = 0;
  const details: MLEvaluation['details'] = [];
  const errorsByPos: Record<number, { sum: number, count: number }> = {
    1:{sum:0, count:0}, 2:{sum:0, count:0}, 3:{sum:0, count:0}, 
    4:{sum:0, count:0}, 5:{sum:0, count:0}, 6:{sum:0, count:0}
  };

  projections.forEach(proj => {
    const realPtsData = Object.values(pontuados).find(p => p.apelido === proj.apelido && p.clube_id === proj.clube_id) || pontuados[proj.atleta_id];
    if (realPtsData && realPtsData.entrou_em_campo) {
      const realPoints = typeof realPtsData.pontuacao === 'number' ? realPtsData.pontuacao : parseFloat(realPtsData.pontuacao) || 0;
      const error = proj.expected_points - realPoints;
      totalError += Math.abs(error);
      count++;
      
      details.push({
        atleta_id: proj.atleta_id,
        apelido: proj.apelido,
        expected: proj.expected_points,
        actual: realPoints,
        error: Math.round(error * 100) / 100
      });

      if (errorsByPos[proj.posicao_id]) {
        errorsByPos[proj.posicao_id].sum += error;
        errorsByPos[proj.posicao_id].count++;
      }
    }
  });

  if (count === 0) return null;
  const mae = Math.round((totalError / count) * 100) / 100;

  // --- RMSE (Root Mean Squared Error) — penaliza erros grandes ---
  const squaredErrors = details.reduce((acc, d) => acc + d.error * d.error, 0);
  const rmse = Math.round(Math.sqrt(squaredErrors / count) * 100) / 100;

  // --- Acurácia direcional: % de vezes que acertamos se vai pontuar acima/abaixo da média ---
  let directionalCorrect = 0;
  details.forEach(d => {
    const predictedAboveAvg = d.expected > 5;
    const actualAboveAvg = d.actual > 5;
    if (predictedAboveAvg === actualAboveAvg) directionalCorrect++;
  });
  const directionalAccuracy = Math.round((directionalCorrect / count) * 100);

  const adjustments: string[] = [];
  const currentWeights = getWeights();

  // --- LEARNING RATE ADAPTATIVO ---
  // Quanto maior o erro, mais agressiva a correção. Quanto mais dados, mais confiança.
  Object.entries(errorsByPos).forEach(([posId, stats]) => {
    if (stats.count >= 3) {
      const avgError = stats.sum / stats.count;
      const errorMagnitude = Math.abs(avgError);

      // Taxa adaptativa: mais dados = mais confiança, mais erro = correção mais forte
      const sampleConfidence = Math.min(1, stats.count / 15); // Normaliza até 15 jogadores
      const errorUrgency = Math.min(1, errorMagnitude / 3); // Normaliza até 3pts de erro
      const adaptiveRate = 0.01 + (0.04 * sampleConfidence * errorUrgency); // 1% a 5%

      let adjustmentDelta = (avgError * -1) * adaptiveRate;
      adjustmentDelta = Math.max(-0.12, Math.min(0.12, adjustmentDelta));

      // Threshold adaptativo: com poucos dados, só ajusta erros maiores
      const threshold = stats.count >= 8 ? 1.0 : 1.5;

      if (errorMagnitude > threshold) {
        currentWeights.positionMultipliers[Number(posId)] += adjustmentDelta;
        // Clamp position multipliers para nunca sair do razoável
        currentWeights.positionMultipliers[Number(posId)] = Math.max(0.7, Math.min(1.3, currentWeights.positionMultipliers[Number(posId)]));

        adjustments.push(
          avgError > 0
           ? `⬇️ Superestimamos ${data.posicoes[posId]?.nome} em ${avgError.toFixed(1)}pts (n=${stats.count}). Peso: ${currentWeights.positionMultipliers[Number(posId)].toFixed(3)} (Δ${adjustmentDelta.toFixed(3)})`
           : `⬆️ Subestimamos ${data.posicoes[posId]?.nome} em ${Math.abs(avgError).toFixed(1)}pts (n=${stats.count}). Peso: ${currentWeights.positionMultipliers[Number(posId)].toFixed(3)} (Δ${adjustmentDelta.toFixed(3)})`
        );
      }
    }
  });

  if (adjustments.length > 0) saveWeights(currentWeights);

  // Métricas de avaliação expandidas
  adjustments.unshift(`📊 MAE: ${mae} | RMSE: ${rmse} | Direção: ${directionalAccuracy}% (${directionalCorrect}/${count})`);

  const evaluation: MLEvaluation = {
    rodada,
    mae,
    details: details.sort((a,b) => Math.abs(b.error) - Math.abs(a.error)),
    adjustments
  };

  localStorage.setItem(`${STORAGE_KEYS.EVALUATIONS}${rodada}`, JSON.stringify(evaluation));
  return evaluation;
};
