import { CartolaData, CartolaMatches, PlayerMatchHistory } from '../types';
import fbrefDataRaw from '../data/fbref_data.json';
import leagueTableRaw from '../data/league_table.json';
import { PlayerProjection, MLEvaluation } from './mlEngine';
import { GoldenTip } from '../utils/crossStats';

export interface AILineupResponse {
  formacao: string;
  titulares: number[];
  reservas: number[];
  capitao: number;
}

export interface EngineContext {
  projections?: PlayerProjection[];
  goldenTips?: GoldenTip[];
  lastEvaluation?: MLEvaluation | null;
  history?: Record<number, PlayerMatchHistory[]>;
}

// Resumo compacto do histórico recente (últimos 5 jogos) para cada jogador
// que tem histórico — evita explodir o prompt com tudo.
const summarizeHistory = (
  history: Record<number, PlayerMatchHistory[]> | undefined,
  relevantIds: Set<number>
) => {
  if (!history) return undefined;
  const out: Record<number, { ult5: number[]; media5: number; stdDev: number }> = {};
  for (const id of relevantIds) {
    const h = history[id];
    if (!h || h.length === 0) continue;
    const recent = h.slice(0, 5).map(x => x.pontos);
    const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const variance = recent.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / recent.length;
    out[id] = {
      ult5: recent.map(x => Math.round(x * 10) / 10),
      media5: Math.round(avg * 100) / 100,
      stdDev: Math.round(Math.sqrt(variance) * 100) / 100,
    };
  }
  return out;
};

export const getLineupPrompt = (
  data: CartolaData,
  matches: CartolaMatches,
  budget: number,
  engine?: EngineContext
): string => {
  // Only send probable players to save context and prevent AI from hallucinating doubtful players
  const probables = data.atletas.filter((p) => p.status_id === 7).map((p) => ({
    id: p.atleta_id,
    nome: p.apelido,
    posicao: data.posicoes[p.posicao_id]?.abreviacao,
    posicao_id: p.posicao_id,
    clube: data.clubes[p.clube_id]?.abreviacao,
    preco: p.preco_num,
    media: p.media_num,
    jogos: p.jogos_num,
    variacao: p.variacao_num,
    ultima: p.pontos_num,
    minimo_valorizar: p.minimo_para_valorizar ?? null,
  }));

  const matchesData = matches.partidas.map((m) => {
    const casa = data.clubes[m.clube_casa_id]?.abreviacao;
    const fora = data.clubes[m.clube_visitante_id]?.abreviacao;
    return {
      jogo: `${casa} x ${fora}`,
      local: m.local,
      data: m.partida_data,
      pos_casa: m.clube_casa_posicao ?? null,
      pos_fora: m.clube_visitante_posicao ?? null,
      aprov_casa: m.aproveitamento_mandante ?? null,
      aprov_fora: m.aproveitamento_visitante ?? null,
    };
  });

  // Dados do motor determinístico (projeções + dicas de ouro + histórico)
  const probableIds = new Set(probables.map(p => p.id));
  const engineProjections = (engine?.projections || [])
    .filter(p => probableIds.has(p.atleta_id))
    .map(p => ({
      id: p.atleta_id,
      exp: p.expected_points,
      teto: p.ceiling,
      piso: p.floor,
      conf: p.confidence,
    }));
  const engineTips = (engine?.goldenTips || []).map(t => ({
    id: t.player.atleta_id,
    clube: t.club.abreviacao,
    adv: t.opponent.abreviacao,
    tipo: t.type,
    score: t.score,
    motivo: t.description,
  }));
  const historyDigest = summarizeHistory(engine?.history, probableIds);
  const evalInfo = engine?.lastEvaluation
    ? {
        rodada: engine.lastEvaluation.rodada,
        mae: engine.lastEvaluation.mae,
        ajustes: engine.lastEvaluation.adjustments,
      }
    : null;

  return `
Analista Elite Cartola FC. Monte a melhor escalação para a rodada.

DADOS:
Partidas: ${JSON.stringify(matchesData)}
Budget: C$ ${budget}
FBref: ${JSON.stringify(fbrefDataRaw)}
Tabela: ${JSON.stringify(leagueTableRaw)}
Prováveis: ${JSON.stringify(probables)}
Projeções: ${JSON.stringify(engineProjections)}
DicasOuro: ${JSON.stringify(engineTips)}
Histórico: ${JSON.stringify(historyDigest || {})}
Última Avaliação: ${JSON.stringify(evalInfo)}

REGRAS:
1. Budget Max C$ ${budget}.
2. Use FBref para Matchups (ex: GK vs ataque fraco, ATA vs defesa porosa).
3. Formações: "4-3-3", "4-4-2", "3-5-2", "3-4-3", "5-3-2".
4. 11 Jogadores + 1 TÉCNICO (ID pos: 6). Respeite quantidades exatas da formação.
5. Capitão: starter, não goleiro/técnico (x2 pts).
6. 1 Reserva por pos, mais barato que o titular.

RESPOSTA (SÓ JSON, SEM TEXTO):
{
  "formacao": "string (ex: 4-3-3)",
  "titulares": [12 IDs (incluindo TEC)],
  "reservas": [Ids posições diferentes],
  "capitao": ID
}
  `.trim();
};

export interface BettingTip {
  jogo: string;
  dica: string;
  justificativa: string;
  confianca: number;
}

export interface BettingTipsResponse {
  arriscadas: BettingTip[];
  normais: BettingTip[];
  faceis: BettingTip[];
}

export const getBettingTipsPrompt = (
  data: CartolaData,
  matches: CartolaMatches,
  engine?: EngineContext
): string => {
  const matchesData = matches.partidas
    .filter((m) => m.valida)
    .map((m) => {
      const home = data.clubes[String(m.clube_casa_id)];
      const away = data.clubes[String(m.clube_visitante_id)];
      return {
        jogo: `${home?.abreviacao ?? m.clube_casa_id} x ${away?.abreviacao ?? m.clube_visitante_id}`,
        casa: home?.abreviacao,
        visitante: away?.abreviacao,
        data: m.partida_data,
        local: m.local,
        pos_casa: m.clube_casa_posicao ?? null,
        pos_fora: m.clube_visitante_posicao ?? null,
        aprov_casa: m.aproveitamento_mandante ?? null,
        aprov_fora: m.aproveitamento_visitante ?? null,
      };
    });

  // Para apostas, o motor agrega projeção por time somando expected_points
  // dos jogadores prováveis — ajuda a IA a ver força ofensiva/defensiva sintética.
  const teamStrength: Record<number, { soma_esperada: number; top_jogadores: { id: number; nome: string; pts: number }[] }> = {};
  (engine?.projections || []).forEach(p => {
    if (!teamStrength[p.clube_id]) teamStrength[p.clube_id] = { soma_esperada: 0, top_jogadores: [] };
    teamStrength[p.clube_id].soma_esperada += p.expected_points;
    teamStrength[p.clube_id].top_jogadores.push({ id: p.atleta_id, nome: p.apelido, pts: p.expected_points });
  });
  Object.values(teamStrength).forEach(t => {
    t.soma_esperada = Math.round(t.soma_esperada * 10) / 10;
    t.top_jogadores = t.top_jogadores.sort((a, b) => b.pts - a.pts).slice(0, 5);
  });
  const strengthByAbrev: Record<string, typeof teamStrength[number]> = {};
  Object.entries(teamStrength).forEach(([clubeId, v]) => {
    const abrev = data.clubes[clubeId]?.abreviacao;
    if (abrev) strengthByAbrev[abrev] = v;
  });

  const evalInfo = engine?.lastEvaluation
    ? { rodada: engine.lastEvaluation.rodada, mae: engine.lastEvaluation.mae }
    : null;

  return `
Analista de apostas Brasileirão Série A. Gere dicas para rodada ${matches.rodada}.

DADOS:
Partidas: ${JSON.stringify(matchesData)}
Tabela: ${JSON.stringify(leagueTableRaw)}
FBref: ${JSON.stringify(fbrefDataRaw)}
ForçaTimes: ${JSON.stringify(strengthByAbrev)}
Última Avaliação: ${JSON.stringify(evalInfo)}

ANÁLISE:
- Use Tabela, FBref (SOT, INT, DS) e força esperada.
- Dicas: Vitória, Empate, Ambas marcam, Over/Under, Handicap, etc.

CATEGORIAS:
- faceis (70-90%): Dados sólidos, times superiores.
- normais (50-69%): Tendências com incerteza.
- arriscadas (30-49%): Zebras/mercados voláteis.

Gere 2-3 dicas por nível. Confiança (0-100).

SÓ JSON (SEM TEXTO):
{
  "faceis": [{"jogo": "A x B", "dica": "X", "justificativa": "Pq...", "confianca": 80}],
  "normais": [...],
  "arriscadas": [...]
}
`.trim();
};
