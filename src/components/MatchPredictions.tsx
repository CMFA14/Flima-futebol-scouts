import { CartolaData, CartolaMatches } from '../types';
import { Target, Shield, TrendingUp, Swords } from 'lucide-react';
import leagueTableData from '../data/league_table.json';
import fbrefData from '../data/fbref_data.json';

interface Props {
  data: CartolaData;
  matches: CartolaMatches;
}

interface LeagueEntry {
  clube: string;
  nome: string;
  posicao: number;
  pts: number;
  vitorias: number;
  empates: number;
  derrotas: number;
  gols_pro: number;
  gols_contra: number;
}

interface FBrefEntry {
  nome_fbref: string;
  overall?: { games?: number; last_5?: string; [key: string]: any };
  home_away?: { home_games?: number; away_games?: number; home_goals_for?: number; away_goals_for?: number; home_goals_against?: number; away_goals_against?: number; [key: string]: any };
  standard?: { for?: any; against?: any };
  keepers?: { for?: any; against?: any };
  shooting?: { for?: any; against?: any };
  misc?: { for?: any; against?: any };
  possession?: { for?: any; against?: any };
  playing_time?: { for?: any; against?: any };
}

const leagueTable: LeagueEntry[] = leagueTableData as LeagueEntry[];
const fbref: Record<string, FBrefEntry> = fbrefData as Record<string, FBrefEntry>;

function findLeagueEntry(abreviacao: string, nome: string): LeagueEntry | undefined {
  return leagueTable.find(
    (e) =>
      e.clube === abreviacao ||
      e.clube.toLowerCase() === abreviacao.toLowerCase() ||
      e.nome.toLowerCase() === nome.toLowerCase() ||
      nome.toLowerCase().includes(e.nome.toLowerCase()) ||
      e.nome.toLowerCase().includes(nome.toLowerCase())
  );
}

// Poisson probability: P(X=k) = (lambda^k * e^-lambda) / k!
function poissonPmf(lambda: number, k: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let logP = -lambda + k * Math.log(lambda);
  for (let i = 2; i <= k; i++) logP -= Math.log(i);
  return Math.exp(logP);
}

function predictMatch(
  homeAbrv: string,
  homeNome: string,
  awayAbrv: string,
  awayNome: string
) {
  const homeLeague = findLeagueEntry(homeAbrv, homeNome);
  const awayLeague = findLeagueEntry(awayAbrv, awayNome);
  const homeFbref = fbref[homeAbrv];
  const awayFbref = fbref[awayAbrv];

  const homeGames = homeLeague
    ? homeLeague.vitorias + homeLeague.empates + homeLeague.derrotas
    : 0;
  const awayGames = awayLeague
    ? awayLeague.vitorias + awayLeague.empates + awayLeague.derrotas
    : 0;

  // --- League average goals (for normalization) ---
  const allTeams = leagueTable.filter(t => {
    const g = t.vitorias + t.empates + t.derrotas;
    return g > 0;
  });
  const leagueAvgGoals = allTeams.length > 0
    ? allTeams.reduce((s, t) => s + t.gols_pro, 0) / allTeams.reduce((s, t) => s + t.vitorias + t.empates + t.derrotas, 0)
    : 1.2;

  // --- Base attack/defense strengths (normalized by league average) ---
  let homeAttackStr = 1.0;
  let homeDefenseStr = 1.0;
  let awayAttackStr = 1.0;
  let awayDefenseStr = 1.0;

  if (homeLeague && homeGames > 0) {
    homeAttackStr = (homeLeague.gols_pro / homeGames) / leagueAvgGoals;
    homeDefenseStr = (homeLeague.gols_contra / homeGames) / leagueAvgGoals;
  }
  if (awayLeague && awayGames > 0) {
    awayAttackStr = (awayLeague.gols_pro / awayGames) / leagueAvgGoals;
    awayDefenseStr = (awayLeague.gols_contra / awayGames) / leagueAvgGoals;
  }

  // --- FBref adjustments: use actual shooting/defensive quality ---
  let homeAttackQuality = 1.0;
  let homeDefenseQuality = 1.0;
  let awayAttackQuality = 1.0;
  let awayDefenseQuality = 1.0;

  if (homeFbref) {
    const hGames = homeFbref.overall?.games || homeGames || 10;
    // Shots on target quality (how clinical the attack is)
    const shotAcc = homeFbref.shooting?.for?.shots_on_target_pct || 33;
    homeAttackQuality = 1 + (shotAcc - 33) * 0.005;
    // Defensive quality: low goals against + high save % + interceptions
    const savePct = homeFbref.keepers?.for?.gk_save_pct || 68;
    const intPer90 = (homeFbref.misc?.for?.interceptions || 60) / hGames;
    homeDefenseQuality = 1 - (savePct - 68) * 0.003 - (intPer90 - 6.5) * 0.008;
  }

  if (awayFbref) {
    const aGames = awayFbref.overall?.games || awayGames || 10;
    const shotAcc = awayFbref.shooting?.for?.shots_on_target_pct || 33;
    awayAttackQuality = 1 + (shotAcc - 33) * 0.005;
    const savePct = awayFbref.keepers?.for?.gk_save_pct || 68;
    const intPer90 = (awayFbref.misc?.for?.interceptions || 60) / aGames;
    awayDefenseQuality = 1 - (savePct - 68) * 0.003 - (intPer90 - 6.5) * 0.008;
  }

  // --- Home/Away splits from FBref (ataque E defesa no contexto) ---
  let homeAdv = 1.12;
  let awayDis = 0.90;
  let homeDefCtx = 1.0; // Fator defensivo do mandante em casa
  let awayDefCtx = 1.0; // Fator defensivo do visitante fora
  if (homeFbref?.home_away) {
    const ha = homeFbref.home_away;
    const hg = ha.home_games || 0;
    const ag = ha.away_games || 0;
    if (hg > 0 && ag > 0) {
      const homeGF = (ha.home_goals_for || 0) / hg;
      const totalGF = ((ha.home_goals_for || 0) + (ha.away_goals_for || 0)) / (hg + ag);
      homeAdv = totalGF > 0 ? homeGF / totalGF : 1.12;
      // Solidez defensiva em casa: menos gols sofridos em casa = fator < 1 (reduz lambda adversário)
      const homeGA = (ha.home_goals_against || 0) / hg;
      const totalGA = ((ha.home_goals_against || 0) + (ha.away_goals_against || 0)) / (hg + ag);
      homeDefCtx = totalGA > 0 ? homeGA / totalGA : 1.0;
    }
  }
  if (awayFbref?.home_away) {
    const ha = awayFbref.home_away;
    const hg = ha.home_games || 0;
    const ag = ha.away_games || 0;
    if (hg > 0 && ag > 0) {
      const awayGF = (ha.away_goals_for || 0) / ag;
      const totalGF = ((ha.home_goals_for || 0) + (ha.away_goals_for || 0)) / (hg + ag);
      awayDis = totalGF > 0 ? awayGF / totalGF : 0.90;
      // Solidez defensiva fora: mais gols sofridos fora = fator > 1 (aumenta lambda adversário)
      const awayGA = (ha.away_goals_against || 0) / ag;
      const totalGA = ((ha.home_goals_against || 0) + (ha.away_goals_against || 0)) / (hg + ag);
      awayDefCtx = totalGA > 0 ? awayGA / totalGA : 1.0;
    }
  }

  // --- Form adjustment (last 5 results) ---
  let homeFormBonus = 1.0;
  let awayFormBonus = 1.0;
  if (homeFbref?.overall?.last_5) {
    const last5 = homeFbref.overall.last_5 as string;
    const wins = (last5.match(/W/g) || []).length;
    const losses = (last5.match(/L/g) || []).length;
    homeFormBonus = 1 + (wins - losses) * 0.025;
  }
  if (awayFbref?.overall?.last_5) {
    const last5 = awayFbref.overall.last_5 as string;
    const wins = (last5.match(/W/g) || []).length;
    const losses = (last5.match(/L/g) || []).length;
    awayFormBonus = 1 + (wins - losses) * 0.025;
  }

  // --- Expected goals (lambda) for Poisson ---
  // homeDefenseQuality < 1 means stronger defense → opponent scores less
  // awayDefenseQuality < 1 means stronger defense → opponent scores less
  // homeDefCtx < 1 = mandante forte em casa defensivamente → reduz gols do visitante
  // awayDefCtx > 1 = visitante vulnerável fora → aumenta gols do mandante
  let lambdaHome = leagueAvgGoals * homeAttackStr * awayDefenseStr * homeAttackQuality * awayDefenseQuality * homeAdv * homeFormBonus * awayDefCtx;
  let lambdaAway = leagueAvgGoals * awayAttackStr * homeDefenseStr * awayAttackQuality * homeDefenseQuality * awayDis * awayFormBonus * homeDefCtx;

  lambdaHome = Math.max(0.3, Math.min(4.0, lambdaHome));
  lambdaAway = Math.max(0.3, Math.min(4.0, lambdaAway));

  // --- Poisson probability matrix (0-6 goals each) ---
  let homeWinProb = 0;
  let drawProb = 0;
  let awayWinProb = 0;

  for (let h = 0; h <= 6; h++) {
    for (let a = 0; a <= 6; a++) {
      const p = poissonPmf(lambdaHome, h) * poissonPmf(lambdaAway, a);
      if (h > a) homeWinProb += p;
      else if (h === a) drawProb += p;
      else awayWinProb += p;
    }
  }

  const total = homeWinProb + drawProb + awayWinProb;
  const homeWinPct = Math.round((homeWinProb / total) * 100);
  const drawPct = Math.round((drawProb / total) * 100);
  const awayWinPct = 100 - homeWinPct - drawPct;

  return {
    homeGoals: Math.round(lambdaHome * 10) / 10,
    awayGoals: Math.round(lambdaAway * 10) / 10,
    homeWinPct,
    drawPct,
    awayWinPct,
    homeLeague,
    awayLeague,
    homeFbref,
    awayFbref,
  };
}

function getTopPlayers(clubId: number, data: CartolaData, count = 3) {
  return data.atletas
    .filter((a) => a.clube_id === clubId && a.media_num > 0 && a.status_id === 7)
    .sort((a, b) => b.media_num - a.media_num)
    .slice(0, count);
}

function ProbBar({
  homeWin,
  draw,
  awayWin,
}: {
  homeWin: number;
  draw: number;
  awayWin: number;
}) {
  return (
    <div className="w-full">
      <div className="flex rounded-full overflow-hidden h-3">
        <div
          className="bg-green-500 transition-all"
          style={{ width: `${homeWin}%` }}
          title={`Casa ${homeWin}%`}
        />
        <div
          className="bg-yellow-500 transition-all"
          style={{ width: `${draw}%` }}
          title={`Empate ${draw}%`}
        />
        <div
          className="bg-red-500 transition-all"
          style={{ width: `${awayWin}%` }}
          title={`Visitante ${awayWin}%`}
        />
      </div>
      <div className="flex justify-between text-xs mt-1 text-gray-400">
        <span className="text-green-400 font-semibold">{homeWin}% Casa</span>
        <span className="text-yellow-400 font-semibold">{draw}% Empate</span>
        <span className="text-red-400 font-semibold">{awayWin}% Visitante</span>
      </div>
    </div>
  );
}

export default function MatchPredictions({ data, matches }: Props) {
  const validMatches = matches.partidas.filter((m) => m.valida);

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <Swords size={24} className="text-purple-400" />
          Previsão de Resultados
        </h2>
        <p className="text-gray-400 text-sm mt-1">
          Rodada {matches.rodada} — previsões baseadas em desempenho e estatísticas FBref
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {validMatches.map((match, idx) => {
          const homeClub = data.clubes[String(match.clube_casa_id)];
          const awayClub = data.clubes[String(match.clube_visitante_id)];
          if (!homeClub || !awayClub) return null;

          const homeAbrv = homeClub.abreviacao;
          const awayAbrv = awayClub.abreviacao;

          const pred = predictMatch(
            homeAbrv,
            homeClub.nome,
            awayAbrv,
            awayClub.nome
          );

          const homePlayers = getTopPlayers(match.clube_casa_id, data);
          const awayPlayers = getTopPlayers(match.clube_visitante_id, data);

          const matchDate = new Date(match.partida_data);
          const dateStr = matchDate.toLocaleDateString('pt-BR', {
            weekday: 'short',
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          });

          const homeLeaguePos = pred.homeLeague?.posicao;
          const awayLeaguePos = pred.awayLeague?.posicao;

          return (
            <div
              key={idx}
              className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden"
            >
              {/* Match header */}
              <div className="bg-gray-800/60 px-4 py-2 flex items-center justify-between border-b border-gray-700">
                <span className="text-xs text-gray-400">{dateStr}</span>
                <span className="text-xs text-gray-500">{match.local}</span>
              </div>

              <div className="p-4 space-y-4">
                {/* Teams row */}
                <div className="flex items-center gap-3">
                  {/* Home */}
                  <div className="flex-1 flex flex-col items-center text-center gap-1">
                    <img
                      src={homeClub.escudos?.['60x60'] || 'https://s3.amazonaws.com/escudos.cartolafc.globo.com/default.png'}
                      alt={homeClub.nome}
                      className="w-12 h-12 object-contain"
                    />
                    <span className="text-white font-bold text-sm leading-tight">
                      {homeClub.abreviacao}
                    </span>
                    {homeLeaguePos && (
                      <span className="text-xs text-gray-500">
                        {homeLeaguePos}º lugar
                      </span>
                    )}
                  </div>

                  {/* Score prediction */}
                  <div className="flex flex-col items-center gap-1 flex-shrink-0">
                    <div className="flex items-center gap-1 text-3xl font-black">
                      <span className="text-green-400">{pred.homeGoals}</span>
                      <span className="text-gray-600 text-xl">×</span>
                      <span className="text-red-400">{pred.awayGoals}</span>
                    </div>
                    <span className="text-xs text-purple-400 font-semibold bg-purple-900/30 px-2 py-0.5 rounded-full">
                      Previsão
                    </span>
                  </div>

                  {/* Away */}
                  <div className="flex-1 flex flex-col items-center text-center gap-1">
                    <img
                      src={awayClub.escudos?.['60x60'] || 'https://s3.amazonaws.com/escudos.cartolafc.globo.com/default.png'}
                      alt={awayClub.nome}
                      className="w-12 h-12 object-contain"
                    />
                    <span className="text-white font-bold text-sm leading-tight">
                      {awayClub.abreviacao}
                    </span>
                    {awayLeaguePos && (
                      <span className="text-xs text-gray-500">
                        {awayLeaguePos}º lugar
                      </span>
                    )}
                  </div>
                </div>

                {/* Probability bar */}
                <ProbBar
                  homeWin={pred.homeWinPct}
                  draw={pred.drawPct}
                  awayWin={pred.awayWinPct}
                />

                {/* Stats row */}
                {(pred.homeFbref || pred.awayFbref) && (
                  <div className="flex gap-2 text-xs">
                    <div className="flex-1 bg-gray-800 rounded-lg p-2 space-y-1">
                      <div className="flex items-center gap-1 text-gray-400 font-semibold mb-1">
                        <Target size={11} />
                        <span>Ataque</span>
                      </div>
                      {pred.homeFbref && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">{homeAbrv}</span>
                          <span className="text-orange-400 font-semibold">
                            {pred.homeFbref.shooting?.for?.shots_on_target} SOG
                          </span>
                        </div>
                      )}
                      {pred.awayFbref && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">{awayAbrv}</span>
                          <span className="text-orange-400 font-semibold">
                            {pred.awayFbref.shooting?.for?.shots_on_target} SOG
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 bg-gray-800 rounded-lg p-2 space-y-1">
                      <div className="flex items-center gap-1 text-gray-400 font-semibold mb-1">
                        <Shield size={11} />
                        <span>Defesa</span>
                      </div>
                      {pred.homeFbref && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">{homeAbrv}</span>
                          <span className="text-blue-400 font-semibold">
                            {pred.homeFbref.misc?.for?.interceptions} INT
                          </span>
                        </div>
                      )}
                      {pred.awayFbref && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">{awayAbrv}</span>
                          <span className="text-blue-400 font-semibold">
                            {pred.awayFbref.misc?.for?.interceptions} INT
                          </span>
                        </div>
                      )}
                    </div>
                    {pred.homeLeague && pred.awayLeague && (
                      <div className="flex-1 bg-gray-800 rounded-lg p-2 space-y-1">
                        <div className="flex items-center gap-1 text-gray-400 font-semibold mb-1">
                          <TrendingUp size={11} />
                          <span>Pts</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">{homeAbrv}</span>
                          <span className="text-yellow-400 font-semibold">
                            {pred.homeLeague.pts}pts
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">{awayAbrv}</span>
                          <span className="text-yellow-400 font-semibold">
                            {pred.awayLeague.pts}pts
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Top players */}
                {(homePlayers.length > 0 || awayPlayers.length > 0) && (
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <p className="text-xs text-gray-500 font-semibold mb-1">
                        Destaques {homeAbrv}
                      </p>
                      <div className="space-y-1">
                        {homePlayers.map((p) => (
                          <div
                            key={p.atleta_id}
                            className="flex items-center gap-1.5 text-xs"
                          >
                            <img
                              src={p.foto?.replace('FORMATO', '45x45')}
                              alt={p.apelido}
                              className="w-5 h-5 rounded-full bg-gray-700 object-cover"
                            />
                            <span className="text-gray-300 truncate flex-1">
                              {p.apelido}
                            </span>
                            <span className="text-orange-400 font-bold whitespace-nowrap">
                              {p.media_num.toFixed(1)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-gray-500 font-semibold mb-1 text-right">
                        Destaques {awayAbrv}
                      </p>
                      <div className="space-y-1">
                        {awayPlayers.map((p) => (
                          <div
                            key={p.atleta_id}
                            className="flex items-center gap-1.5 text-xs flex-row-reverse"
                          >
                            <img
                              src={p.foto?.replace('FORMATO', '45x45')}
                              alt={p.apelido}
                              className="w-5 h-5 rounded-full bg-gray-700 object-cover"
                            />
                            <span className="text-gray-300 truncate flex-1 text-right">
                              {p.apelido}
                            </span>
                            <span className="text-orange-400 font-bold whitespace-nowrap">
                              {p.media_num.toFixed(1)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {validMatches.length === 0 && (
          <div className="col-span-2 flex flex-col items-center justify-center py-16 text-center">
            <Swords size={48} className="text-gray-600 mb-4" />
            <p className="text-gray-400 font-medium">
              Nenhuma partida válida encontrada para esta rodada.
            </p>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-600 mt-6 text-center">
        * Previsões são estimativas estatísticas e não garantem o resultado real.
      </p>
    </div>
  );
}
