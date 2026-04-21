import { Player, Match, Club, FBrefClubStats, PlayerMatchHistory } from '../types';
import fbrefDataRaw from '../data/fbref_data.json';

const fbrefData = fbrefDataRaw as unknown as Record<string, FBrefClubStats>;

export interface GoldenTip {
  player: Player;
  club: Club;
  opponent: Club;
  type: 'LADRAO_BOLA' | 'PAREDAO' | 'AVENIDA' | 'CACA_FALTAS' | 'HOT_SHOOTER' | 'PITBULL' | 'SG_HUNTER' | 'GARCOM' | 'CARRASCO_PENALTI' | 'CROSS_KING';
  description: string;
  score: number; // Used for sorting relevance
}

// Normaliza o score de uma tip para escala 0–100, baseado em uma referência por tipo.
// Isso permite comparar tips de tipos distintos no mesmo ranking.
const SCORE_NORMS: Record<GoldenTip['type'], number> = {
  LADRAO_BOLA: 18,     // dsMedia(~2) * oppTacklesPerGame(~9.5) ≈ 19
  PAREDAO: 12,         // defesasMedia(~2.5) * oppSotPerGame(~4.5) ≈ 11
  AVENIDA: 45,         // (gAMedia+1)(~1.3) * oppGAPerGame(~1.5) * 25 ≈ 48
  CACA_FALTAS: 23,     // fsMedia(~1.7) * oppFoulsPerGame(~14) ≈ 24
  HOT_SHOOTER: 60,     // base empírica
  PITBULL: 80,         // totalDs(~12) * 7 ≈ 84
  SG_HUNTER: 28,       // sgMedia(~0.35) * (2-oppGpg)(~1.1) * 75 ≈ 29
  GARCOM: 38,          // aMedia(~0.25) * oppGAPerGame(~1.5) * 100 ≈ 38
  CARRASCO_PENALTI: 60,
  CROSS_KING: 48,
};

const normalize = (score: number, type: GoldenTip['type']): number => {
  const ref = SCORE_NORMS[type] || 50;
  return Math.round((score / ref) * 100);
};

export const generateGoldenTips = (
  players: Player[],
  matches: Match[],
  clubes: Record<string, Club>,
  history: Record<number, PlayerMatchHistory[]>
): GoldenTip[] => {
  const tips: GoldenTip[] = [];

  // Considerar apenas jogadores prováveis (status = 7)
  const probablePlayers = players.filter((p) => p.status_id === 7);

  probablePlayers.forEach((p) => {
    const club = clubes[String(p.clube_id)];
    if (!club) return;
    
    // Identifica se o jogador joga na rodada e quem é o adversário
    const match = matches.find(
      (m) => m.clube_casa_id === p.clube_id || m.clube_visitante_id === p.clube_id
    );
    if (!match || !match.valida) return;

    const opponentId = match.clube_casa_id === p.clube_id ? match.clube_visitante_id : match.clube_casa_id;
    const opponentClub = clubes[String(opponentId)];
    if (!opponentClub) return;

    const oppFbref = fbrefData[opponentClub.abreviacao];
    if (!oppFbref) return;

    // Cálculo da quantidade de jogos (evita divisão por zero)
    const games = p.jogos_num > 0 ? p.jogos_num : 1;
    // Jogos do adversário no FBref, para normalizar totais em médias por jogo
    const oppGames = oppFbref.overall?.games && oppFbref.overall.games > 0 ? oppFbref.overall.games : 10;

    // 1. Zagueiros/Laterais/Meias com muitos desarmes contra times que perdem muita posse/sofrem desarmes
    const dsMedia = (p.scout?.DS || 0) / games;
    if ((p.posicao_id === 2 || p.posicao_id === 3 || p.posicao_id === 4) && dsMedia >= 1.5) {
      const oppTacklesConcededPerGame = (oppFbref.misc?.against?.tackles_won || 0) / oppGames;
      if (oppTacklesConcededPerGame > 9.5) {
        tips.push({
          player: p,
          club,
          opponent: opponentClub,
          type: 'LADRAO_BOLA',
          description: `Média de ${dsMedia.toFixed(1)} desarmes/jogo enfrentando o ${opponentClub.nome}, que cede a bola com frequência (${oppTacklesConcededPerGame.toFixed(1)} roubadas sofridas/jogo).`,
          score: dsMedia * oppTacklesConcededPerGame
        });
      }
    }

    // 2. Goleiros com boas defesas contra times que chutam demais (Chuva de Defesas)
    if (p.posicao_id === 1) {
      const defesasMedia = (p.scout?.DE || 0) / games;
      const oppSoTPerGame = (oppFbref.shooting?.for?.shots_on_target || 0) / oppGames;
      if (defesasMedia >= 2.0 && oppSoTPerGame > 4.2) {
        tips.push({
          player: p,
          club,
          opponent: opponentClub,
          type: 'PAREDAO',
          description: `Goleiro exigido (${defesasMedia.toFixed(1)} DEs/jogo) pega o ${opponentClub.nome}, que finaliza no alvo ${oppSoTPerGame.toFixed(1)}x/jogo. Excelente para bônus de DD.`,
          score: defesasMedia * oppSoTPerGame
        });
      }
    }

    // 3. Atacantes matadores contra piores defesas
    if (p.posicao_id === 5) {
      const gAMedia = ((p.scout?.G || 0) + (p.scout?.A || 0)) / games;
      const oppGAPerGame = (oppFbref.standard?.for?.goals_against || 0) / oppGames;
      if (gAMedia >= 0.25 && oppGAPerGame > 1.4) {
        tips.push({
          player: p,
          club,
          opponent: opponentClub,
          type: 'AVENIDA',
          description: `Atacante perigoso (G/A de ${gAMedia.toFixed(2)}) contra o ${opponentClub.nome}, defesa vazada (${oppGAPerGame.toFixed(1)} gols sofridos/jogo).`,
          score: (gAMedia + 1) * oppGAPerGame * 25
        });
      }
    }

    // 4. Meias que sofrem muitas faltas e adversários que batem muito
    if (p.posicao_id === 4 || p.posicao_id === 5) { // Meia ou Atacante caça-falta
      const fsMedia = (p.scout?.FS || 0) / games;
      const oppFoulsPerGame = (oppFbref.misc?.for?.fouls || 0) / oppGames;
      if (fsMedia >= 1.5 && oppFoulsPerGame > 13.5) {
        tips.push({
          player: p,
          club,
          opponent: opponentClub,
          type: 'CACA_FALTAS',
          description: `Muito caçado (${fsMedia.toFixed(1)} FS/jogo), enfrenta o ${opponentClub.nome}, que comete ${oppFoulsPerGame.toFixed(1)} faltas/jogo. Multiplicador de pontos passivos!`,
          score: fsMedia * oppFoulsPerGame
        });
      }
    }

    // 5. SG HUNTER: Defensores/Goleiros com alto SG contra times que fazem poucos gols
    if ([1, 2, 3].includes(p.posicao_id)) {
      const sgMedia = (p.scout?.SG || 0) / games;
      const oppGoalsPer90 = oppFbref.standard?.for?.goals_per90 || 1.2;
      if (sgMedia >= 0.2 && oppGoalsPer90 < 1.0) {
        tips.push({
          player: p,
          club,
          opponent: opponentClub,
          type: 'SG_HUNTER',
          description: `Acumula ${(p.scout?.SG || 0)} SG em ${games} jogos contra o ${opponentClub.nome}, que marca apenas ${oppGoalsPer90.toFixed(1)} gols/jogo. Alta chance de manter o zero!`,
          score: sgMedia * (2 - oppGoalsPer90) * 75
        });
      }
    }

    // 6. GARÇOM: Meias/Atacantes com muitas assistências contra defesas porosas
    if ([4, 5].includes(p.posicao_id)) {
      const aMedia = (p.scout?.A || 0) / games;
      const oppGAPer90 = oppFbref.keepers?.for?.gk_goals_against_per90 || 1.2;
      if (aMedia >= 0.2 && oppGAPer90 > 1.3) {
        tips.push({
          player: p,
          club,
          opponent: opponentClub,
          type: 'GARCOM',
          description: `Garçom de luxo! ${(p.scout?.A || 0)} assistências em ${games} jogos (${aMedia.toFixed(2)}/jogo). O ${opponentClub.nome} leva ${oppGAPer90.toFixed(1)} gols/jogo — muitas chances de participação!`,
          score: aMedia * oppGAPer90 * 100
        });
      }
    }

    // 7. CARRASCO_PENALTI: Jogadores que sofrem/convertem pênaltis contra times que cometem muitos
    if ([4, 5].includes(p.posicao_id)) {
      const psMedia = (p.scout?.PS || 0) / games;
      const oppPensConcededPerGame = (oppFbref.misc?.for?.pens_conceded || 0) / oppGames;
      if ((psMedia >= 0.1 || (p.scout?.PS || 0) >= 1) && oppPensConcededPerGame >= 0.15) {
        tips.push({
          player: p,
          club,
          opponent: opponentClub,
          type: 'CARRASCO_PENALTI',
          description: `Já sofreu ${(p.scout?.PS || 0)} pênalti(s) na temporada! O ${opponentClub.nome} cede ${oppPensConcededPerGame.toFixed(2)} pênaltis/jogo — combinação explosiva!`,
          score: (psMedia + 0.5) * (oppPensConcededPerGame + 0.1) * 250
        });
      }
    }

    // 8. CROSS KING: Laterais de times que cruzam muito contra defesas vulneráveis no alto
    if (p.posicao_id === 2) {
      const myClubFbref = fbrefData[club.abreviacao];
      if (myClubFbref) {
        const myGames = myClubFbref.overall?.games || 10;
        const crossesPerGame = (myClubFbref.misc?.for?.crosses || 0) / myGames;
        const oppGA = oppFbref.keepers?.for?.gk_goals_against_per90 || 1.2;
        const aMedia = (p.scout?.A || 0) / games;
        if (crossesPerGame > 13 && oppGA > 1.2 && aMedia >= 0.1) {
          tips.push({
            player: p,
            club,
            opponent: opponentClub,
            type: 'CROSS_KING',
            description: `Time cruza ${crossesPerGame.toFixed(0)} vezes/jogo e lateral já tem ${(p.scout?.A || 0)} assistência(s). Contra o ${opponentClub.nome} (${oppGA.toFixed(1)} gols sofridos/jogo), pode ser decisivo!`,
            score: crossesPerGame * (aMedia + 0.3) * oppGA * 30
          });
        }
      }
    }

    // --- REGRAS NOVAS BASEADAS EM FORM/HISTÓRICO RECENTE ---
    const playerHist = history ? history[p.atleta_id] : null;
    if (playerHist && playerHist.length >= 2) {
      // Analisar apenas os últimos 3 jogos disponiveis
      const recent = playerHist.slice(0, 3);

      // HOT_SHOOTER: Finalizações no alvo/fora/trave > 2 por jogo recente
      if (p.posicao_id === 4 || p.posicao_id === 5) {
        let matchesWithHighShots = 0;
        let totalShots = 0;
        recent.forEach(h => {
          const shots = (h.scout?.FF || 0) + (h.scout?.FD || 0) + (h.scout?.FT || 0) + (h.scout?.G || 0);
          totalShots += shots;
          if (shots >= 2) matchesWithHighShots++;
        });

        const oppGAPerGame = (oppFbref.standard?.for?.goals_against || 0) / oppGames;
        if (matchesWithHighShots >= 2 && oppGAPerGame > 1.2) {
          tips.push({
            player: p,
            club,
            opponent: opponentClub,
            type: 'HOT_SHOOTER',
            description: `Sequência "Em Chamas"! Chutou ${totalShots} vezes nas últimas partidas. Pega a defesa fraca do ${opponentClub.nome} (${oppGAPerGame.toFixed(1)} gols sofridos/jogo).`,
            score: (totalShots * 15) + (oppGAPerGame * 10)
          });
        }
      }

      // PITBULL: Desarmes muito constantes nos ultimos jogos (e.g. 3+ por jogo)
      if (p.posicao_id === 2 || p.posicao_id === 3 || p.posicao_id === 4) {
        let totalDs = 0;
        let matchesWithHighDs = 0;
        recent.forEach(h => {
          const ds = h.scout?.DS || 0;
          totalDs += ds;
          if (ds >= 3) matchesWithHighDs++;
        });

        const oppTacklesConcededPerGame = (oppFbref.misc?.against?.tackles_won || 0) / oppGames;
        if (matchesWithHighDs >= 2 && oppTacklesConcededPerGame > 9.0) {
           tips.push({
             player: p,
             club,
             opponent: opponentClub,
             type: 'PITBULL',
             description: `Fase "Cachorro Louco"! Foram ${totalDs} desarmes nos últimos jogos. Ganhando SG ou não, a pontuação base é garantida!`,
             score: (totalDs * 7)
           });
        }
      }
    }
  });

  // Normaliza scores para escala comparável (0–100)
  tips.forEach(t => { t.score = normalize(t.score, t.type); });

  // Dedup por (jogador, categoria): UI separa Defesa × Ataque, então mantemos a
  // melhor tip de cada categoria por jogador. Evita o mesmo atleta aparecer
  // em 3 cards de ataque, mas ainda permite que o mesmo jogador esteja em
  // ambos os lados quando faz sentido.
  const DEFENSE_TYPES = new Set<GoldenTip['type']>(['LADRAO_BOLA', 'PAREDAO', 'PITBULL', 'SG_HUNTER']);
  const best = new Map<string, GoldenTip>();
  tips.forEach(t => {
    const cat = DEFENSE_TYPES.has(t.type) ? 'D' : 'A';
    const key = `${t.player.atleta_id}-${cat}`;
    const current = best.get(key);
    if (!current || t.score > current.score) best.set(key, t);
  });

  return Array.from(best.values()).sort((a, b) => b.score - a.score);
};
