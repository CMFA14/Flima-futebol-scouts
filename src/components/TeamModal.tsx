import { X, Home, Plane, Trophy, Swords, Shield, Target, TrendingUp, TrendingDown, AlertTriangle, Award } from 'lucide-react';
import { CartolaData, CartolaMatches, FBrefClubStats, Player, PlayerMatchHistory } from '../types';
import fbrefDataRaw from '../data/fbref_data.json';

const fbrefData = fbrefDataRaw as unknown as Record<string, FBrefClubStats>;

interface Props {
  clubeId: number;
  data: CartolaData;
  matches: CartolaMatches;
  history: Record<number, PlayerMatchHistory[]>;
  onClose: () => void;
  onPlayerClick: (p: Player) => void;
}

const POS_NAMES: Record<number, string> = { 1: 'GOL', 2: 'LAT', 3: 'ZAG', 4: 'MEI', 5: 'ATA', 6: 'TEC' };
const POS_COLORS: Record<number, string> = {
  1: 'bg-yellow-600', 2: 'bg-green-600', 3: 'bg-blue-600', 4: 'bg-purple-600', 5: 'bg-red-600', 6: 'bg-gray-600',
};

function StatBox({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-gray-800/80 rounded-lg p-3 text-center border border-gray-700/50">
      <div className={`text-xl font-bold ${color || 'text-white'}`}>{value}</div>
      <div className="text-[11px] text-gray-400 mt-0.5 leading-tight">{label}</div>
      {sub && <div className="text-[10px] text-gray-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function TeamModal({ clubeId, data, matches, history, onClose, onPlayerClick }: Props) {
  const club = data.clubes[String(clubeId)];
  if (!club) return null;

  const fbref = fbrefData[club.abreviacao];
  const ha = fbref?.home_away;
  const std = fbref?.standard;
  const kpr = fbref?.keepers;
  const sht = fbref?.shooting;
  const msc = fbref?.misc;

  // Próximo adversário
  const nextMatch = matches.partidas.find(m => m.clube_casa_id === clubeId || m.clube_visitante_id === clubeId);
  const isHome = nextMatch ? nextMatch.clube_casa_id === clubeId : null;
  const opponentId = nextMatch ? (isHome ? nextMatch.clube_visitante_id : nextMatch.clube_casa_id) : null;
  const opponent = opponentId ? data.clubes[String(opponentId)] : null;
  const oppFbref = opponent ? fbrefData[opponent.abreviacao] : null;

  // Jogadores do time
  const teamPlayers = data.atletas.filter(p => p.clube_id === clubeId && p.status_id === 7);

  // Top pontuadores (pela média)
  const topByAvg = [...teamPlayers].sort((a, b) => b.media_num - a.media_num).slice(0, 5);

  // Artilheiros
  const topScorers = [...teamPlayers].filter(p => (p.scout?.G || 0) > 0).sort((a, b) => (b.scout?.G || 0) - (a.scout?.G || 0)).slice(0, 5);

  // Maiores assistentes
  const topAssisters = [...teamPlayers].filter(p => (p.scout?.A || 0) > 0).sort((a, b) => (b.scout?.A || 0) - (a.scout?.A || 0)).slice(0, 5);

  // Maiores desarmadores
  const topTacklers = [...teamPlayers].filter(p => (p.scout?.DS || 0) > 0).sort((a, b) => (b.scout?.DS || 0) - (a.scout?.DS || 0)).slice(0, 5);

  // Jogadores em má fase (últimos 3 jogos com pontuação negativa ou < 2)
  const badForm = teamPlayers.filter(p => {
    const h = history[p.atleta_id];
    if (!h || h.length < 2) return false;
    const avg = h.slice(0, 3).reduce((s, x) => s + x.pontos, 0) / Math.min(3, h.length);
    return avg < 1;
  });

  // Forma recente do time (aproveitamento da API)
  const aproveitamento = nextMatch
    ? (isHome ? nextMatch.aproveitamento_mandante : nextMatch.aproveitamento_visitante)
    : null;

  // Estatísticas gerais
  const totalGames = ha ? (ha.home_games || 0) + (ha.away_games || 0) : std?.for?.games || 0;
  const totalPts = ha ? (ha.home_points || 0) + (ha.away_points || 0) : 0;
  const totalGF = ha ? (ha.home_goals_for || 0) + (ha.away_goals_for || 0) : std?.for?.goals || 0;
  const totalGA = ha ? (ha.home_goals_against || 0) + (ha.away_goals_against || 0) : (std?.against?.goals || 0);
  const totalW = ha ? (ha.home_wins || 0) + (ha.away_wins || 0) : 0;
  const totalD = ha ? (ha.home_ties || 0) + (ha.away_ties || 0) : 0;
  const totalL = ha ? (ha.home_losses || 0) + (ha.away_losses || 0) : 0;
  const aprovPct = totalGames > 0 ? Math.round((totalPts / (totalGames * 3)) * 100) : 0;

  const escudo60 = club.escudos?.['60x60'] || club.escudos?.['45x45'] || '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 border-b border-gray-700 p-5">
          <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors">
            <X size={22} />
          </button>
          <div className="flex items-center gap-4">
            <img src={escudo60} alt={club.nome} className="w-14 h-14 object-contain" />
            <div>
              <h2 className="text-2xl font-bold text-white">{club.nome}</h2>
              <div className="flex items-center gap-3 mt-1">
                {ha?.rank && (
                  <span className="text-sm text-orange-400 font-semibold flex items-center gap-1">
                    <Trophy size={14} /> {ha.rank}° lugar
                  </span>
                )}
                <span className={`text-sm font-semibold px-2 py-0.5 rounded-full ${
                  aprovPct >= 60 ? 'bg-green-900/50 text-green-400' :
                  aprovPct >= 40 ? 'bg-yellow-900/50 text-yellow-400' :
                  'bg-red-900/50 text-red-400'
                }`}>
                  {aprovPct}% aprov.
                </span>
                <span className="text-xs text-gray-500">{teamPlayers.length} prováveis</span>
              </div>
            </div>
          </div>
        </div>

        <div className="p-5 space-y-5">

          {/* Próximo Adversário */}
          {nextMatch && opponent && (
            <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Swords size={16} className="text-orange-400" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Próximo Adversário</h3>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <img src={opponent.escudos?.['30x30'] || ''} alt={opponent.nome} className="w-8 h-8" />
                  <div>
                    <span className="text-white font-semibold">{opponent.nome}</span>
                    <div className="flex items-center gap-2 mt-0.5">
                      {isHome ? (
                        <span className="text-xs bg-green-900/50 text-green-400 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Home size={10} /> Em Casa
                        </span>
                      ) : (
                        <span className="text-xs bg-blue-900/50 text-blue-400 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Plane size={10} /> Fora
                        </span>
                      )}
                      {nextMatch.local && <span className="text-xs text-gray-500">{nextMatch.local}</span>}
                    </div>
                  </div>
                </div>
                {/* Adversário stats */}
                {oppFbref?.home_away && (
                  <div className="flex gap-3 text-center">
                    <div>
                      <div className="text-xs text-gray-500">Gols/J</div>
                      <div className="text-sm font-bold text-white">
                        {((oppFbref.standard?.for?.goals || 0) / (oppFbref.home_away.home_games! + oppFbref.home_away.away_games! || 1)).toFixed(1)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Sofre/J</div>
                      <div className="text-sm font-bold text-red-400">
                        {(oppFbref.keepers?.for?.gk_goals_against_per90 || 0).toFixed(1)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">SG%</div>
                      <div className="text-sm font-bold text-green-400">
                        {(oppFbref.keepers?.for?.gk_clean_sheets_pct || 0).toFixed(0)}%
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Forma Recente */}
          {aproveitamento && aproveitamento.length > 0 && (
            <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp size={16} className="text-cyan-400" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Forma Recente</h3>
              </div>
              <div className="flex items-center gap-1.5">
                {aproveitamento.map((r, i) => (
                  <div key={i} className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                    r === 'v' ? 'bg-green-600 text-white' :
                    r === 'e' ? 'bg-yellow-600 text-white' :
                    'bg-red-600 text-white'
                  }`}>
                    {r.toUpperCase()}
                  </div>
                ))}
                <span className="ml-3 text-sm text-gray-400">
                  {aproveitamento.filter(r => r === 'v').length}V {aproveitamento.filter(r => r === 'e').length}E {aproveitamento.filter(r => r === 'd').length}D
                </span>
              </div>
            </div>
          )}

          {/* Stats Gerais */}
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-2">
              <Award size={16} className="text-yellow-400" /> Estatísticas Gerais
            </h3>
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
              <StatBox label="Jogos" value={totalGames} />
              <StatBox label="Vitórias" value={totalW} color="text-green-400" />
              <StatBox label="Empates" value={totalD} color="text-yellow-400" />
              <StatBox label="Derrotas" value={totalL} color="text-red-400" />
              <StatBox label="Pontos" value={totalPts} color="text-orange-400" />
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 mt-2">
              <StatBox label="Gols Feitos" value={totalGF} color="text-green-400" sub={`${(totalGames > 0 ? totalGF / totalGames : 0).toFixed(1)}/j`} />
              <StatBox label="Gols Sofridos" value={totalGA} color="text-red-400" sub={`${(totalGames > 0 ? totalGA / totalGames : 0).toFixed(1)}/j`} />
              <StatBox label="Saldo" value={totalGF - totalGA > 0 ? `+${totalGF - totalGA}` : `${totalGF - totalGA}`} color={totalGF - totalGA > 0 ? 'text-green-400' : 'text-red-400'} />
              <StatBox label="Posse" value={`${std?.for?.possession || '-'}%`} />
              {kpr?.for && <StatBox label="Defesas GK" value={`${(kpr.for.gk_save_pct || 0).toFixed(0)}%`} color="text-cyan-400" />}
            </div>
          </div>

          {/* Home vs Away comparação */}
          {ha && (
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-2">
                <Home size={16} className="text-green-400" /> Casa vs <Plane size={16} className="text-blue-400" /> Fora
              </h3>
              <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-900 text-gray-400 text-xs uppercase">
                    <tr>
                      <th className="px-3 py-2 text-left">Contexto</th>
                      <th className="px-2 py-2 text-center">J</th>
                      <th className="px-2 py-2 text-center">V</th>
                      <th className="px-2 py-2 text-center">E</th>
                      <th className="px-2 py-2 text-center">D</th>
                      <th className="px-2 py-2 text-center">GF</th>
                      <th className="px-2 py-2 text-center">GC</th>
                      <th className="px-2 py-2 text-center">Pts</th>
                      <th className="px-2 py-2 text-center">Aprov</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700/50">
                    <tr className="hover:bg-gray-700/30">
                      <td className="px-3 py-2 font-semibold text-green-400 flex items-center gap-1.5"><Home size={13} /> Casa</td>
                      <td className="px-2 py-2 text-center text-gray-300">{ha.home_games || 0}</td>
                      <td className="px-2 py-2 text-center text-green-400">{ha.home_wins || 0}</td>
                      <td className="px-2 py-2 text-center text-yellow-400">{ha.home_ties || 0}</td>
                      <td className="px-2 py-2 text-center text-red-400">{ha.home_losses || 0}</td>
                      <td className="px-2 py-2 text-center text-gray-300">{ha.home_goals_for || 0}</td>
                      <td className="px-2 py-2 text-center text-gray-300">{ha.home_goals_against || 0}</td>
                      <td className="px-2 py-2 text-center font-bold text-white">{ha.home_points || 0}</td>
                      <td className="px-2 py-2 text-center">
                        <span className={`text-xs font-semibold ${(ha.home_points_avg || 0) >= 2 ? 'text-green-400' : (ha.home_points_avg || 0) >= 1.2 ? 'text-yellow-400' : 'text-red-400'}`}>
                          {(ha.home_points_avg || 0).toFixed(1)}
                        </span>
                      </td>
                    </tr>
                    <tr className="hover:bg-gray-700/30">
                      <td className="px-3 py-2 font-semibold text-blue-400 flex items-center gap-1.5"><Plane size={13} /> Fora</td>
                      <td className="px-2 py-2 text-center text-gray-300">{ha.away_games || 0}</td>
                      <td className="px-2 py-2 text-center text-green-400">{ha.away_wins || 0}</td>
                      <td className="px-2 py-2 text-center text-yellow-400">{ha.away_ties || 0}</td>
                      <td className="px-2 py-2 text-center text-red-400">{ha.away_losses || 0}</td>
                      <td className="px-2 py-2 text-center text-gray-300">{ha.away_goals_for || 0}</td>
                      <td className="px-2 py-2 text-center text-gray-300">{ha.away_goals_against || 0}</td>
                      <td className="px-2 py-2 text-center font-bold text-white">{ha.away_points || 0}</td>
                      <td className="px-2 py-2 text-center">
                        <span className={`text-xs font-semibold ${(ha.away_points_avg || 0) >= 2 ? 'text-green-400' : (ha.away_points_avg || 0) >= 1.2 ? 'text-yellow-400' : 'text-red-400'}`}>
                          {(ha.away_points_avg || 0).toFixed(1)}
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Indicadores Avançados */}
          {(sht?.for || kpr?.for || msc?.for) && (
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-2">
                <Target size={16} className="text-purple-400" /> Indicadores Avançados
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {sht?.for && (
                  <>
                    <StatBox label="Finalizações" value={sht.for.shots || 0} sub={`${(sht.for.shots_per90 || 0).toFixed(1)}/90min`} />
                    <StatBox label="No Alvo" value={sht.for.shots_on_target || 0} sub={`${(sht.for.shots_on_target_pct || 0).toFixed(0)}% precisão`} color="text-green-400" />
                    <StatBox label="Gol/Chute" value={`${((sht.for.goals_per_shot || 0) * 100).toFixed(0)}%`} sub="conversão" />
                  </>
                )}
                {kpr?.for && (
                  <>
                    <StatBox label="Clean Sheets" value={kpr.for.gk_clean_sheets || 0} sub={`${(kpr.for.gk_clean_sheets_pct || 0).toFixed(0)}%`} color="text-cyan-400" />
                    <StatBox label="Gols Sofridos/90" value={(kpr.for.gk_goals_against_per90 || 0).toFixed(2)} color="text-red-400" />
                    <StatBox label="Defesas GK" value={kpr.for.gk_saves || 0} sub={`${(kpr.for.gk_save_pct || 0).toFixed(0)}% aproveit.`} />
                  </>
                )}
                {msc?.for && (
                  <>
                    <StatBox label="Desarmes" value={msc.for.tackles_won || 0} sub={`${(totalGames > 0 ? (msc.for.tackles_won || 0) / totalGames : 0).toFixed(1)}/j`} />
                    <StatBox label="Interceptações" value={msc.for.interceptions || 0} />
                    <StatBox label="Cruzamentos" value={msc.for.crosses || 0} sub={`${(totalGames > 0 ? (msc.for.crosses || 0) / totalGames : 0).toFixed(1)}/j`} />
                  </>
                )}
              </div>
            </div>
          )}

          {/* Disciplina */}
          {std?.for && (
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-2">
                <AlertTriangle size={16} className="text-yellow-400" /> Disciplina
              </h3>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                <StatBox label="Amarelos" value={std.for.cards_yellow || 0} color="text-yellow-400" />
                <StatBox label="Vermelhos" value={std.for.cards_red || 0} color="text-red-500" />
                <StatBox label="Faltas" value={msc?.for?.fouls || 0} sub={`${(totalGames > 0 ? (msc?.for?.fouls || 0) / totalGames : 0).toFixed(1)}/j`} />
                {msc?.for?.pens_conceded !== undefined && (
                  <StatBox label="Pên. Cometidos" value={msc.for.pens_conceded || 0} color="text-red-400" />
                )}
              </div>
            </div>
          )}

          {/* Top Pontuadores */}
          {topByAvg.length > 0 && (
            <PlayerRankingSection
              title="Maiores Pontuadores"
              icon={<Trophy size={16} className="text-orange-400" />}
              players={topByAvg}

              getValue={p => p.media_num.toFixed(1)}
              getSub={p => `${p.jogos_num}J`}
              valueColor="text-orange-400"
              onPlayerClick={onPlayerClick}
            />
          )}

          {/* Artilheiros */}
          {topScorers.length > 0 && (
            <PlayerRankingSection
              title="Artilheiros"
              icon={<Target size={16} className="text-green-400" />}
              players={topScorers}

              getValue={p => `${p.scout?.G || 0}`}
              getSub={p => `${((p.scout?.G || 0) / Math.max(1, p.jogos_num)).toFixed(2)}/j`}
              valueColor="text-green-400"
              valueLabel="gols"
              onPlayerClick={onPlayerClick}
            />
          )}

          {/* Assistentes */}
          {topAssisters.length > 0 && (
            <PlayerRankingSection
              title="Maiores Assistentes"
              icon={<Award size={16} className="text-cyan-400" />}
              players={topAssisters}

              getValue={p => `${p.scout?.A || 0}`}
              getSub={p => `${((p.scout?.A || 0) / Math.max(1, p.jogos_num)).toFixed(2)}/j`}
              valueColor="text-cyan-400"
              valueLabel="assist."
              onPlayerClick={onPlayerClick}
            />
          )}

          {/* Desarmadores */}
          {topTacklers.length > 0 && (
            <PlayerRankingSection
              title="Maiores Desarmadores"
              icon={<Shield size={16} className="text-blue-400" />}
              players={topTacklers}

              getValue={p => `${p.scout?.DS || 0}`}
              getSub={p => `${((p.scout?.DS || 0) / Math.max(1, p.jogos_num)).toFixed(1)}/j`}
              valueColor="text-blue-400"
              valueLabel="desarmes"
              onPlayerClick={onPlayerClick}
            />
          )}

          {/* Em má fase */}
          {badForm.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-2">
                <TrendingDown size={16} className="text-red-400" /> Em Má Fase
              </h3>
              <div className="flex flex-wrap gap-2">
                {badForm.map(p => {
                  const h = history[p.atleta_id]?.slice(0, 3) || [];
                  const avg = h.length > 0 ? (h.reduce((s, x) => s + x.pontos, 0) / h.length).toFixed(1) : '0';
                  return (
                    <button key={p.atleta_id} onClick={() => onPlayerClick(p)} className="bg-red-900/20 border border-red-800/40 rounded-lg px-3 py-2 flex items-center gap-2 hover:bg-red-900/40 transition-colors">
                      <img src={p.foto?.replace('FORMATO', '30x30') || ''} alt={p.apelido} className="w-6 h-6 rounded-full" />
                      <span className="text-sm text-white">{p.apelido}</span>
                      <span className="text-xs text-red-400 font-semibold">{avg} pts/j</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Elenco Completo */}
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-3">
              Elenco Provável ({teamPlayers.length})
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {[1, 2, 3, 4, 5, 6].map(posId => {
                const posPlayers = teamPlayers.filter(p => p.posicao_id === posId).sort((a, b) => b.media_num - a.media_num);
                if (posPlayers.length === 0) return null;
                return posPlayers.map(p => (
                  <button
                    key={p.atleta_id}
                    onClick={() => onPlayerClick(p)}
                    className="flex items-center gap-2.5 bg-gray-800/60 hover:bg-gray-700/60 border border-gray-700/40 rounded-lg px-3 py-2 transition-colors text-left"
                  >
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${POS_COLORS[posId]} text-white`}>
                      {POS_NAMES[posId]}
                    </span>
                    <img src={p.foto?.replace('FORMATO', '30x30') || ''} alt={p.apelido} className="w-6 h-6 rounded-full" />
                    <span className="text-sm text-white flex-1 truncate">{p.apelido}</span>
                    <span className="text-xs text-gray-400">C$ {p.preco_num.toFixed(1)}</span>
                    <span className="text-xs font-semibold text-orange-400">{p.media_num.toFixed(1)}</span>
                  </button>
                ));
              })}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

// Sub-componente: seção de ranking de jogadores
function PlayerRankingSection({ title, icon, players, getValue, getSub, valueColor, valueLabel, onPlayerClick }: {
  title: string;
  icon: React.ReactNode;
  players: Player[];
  getValue: (p: Player) => string;
  getSub?: (p: Player) => string;
  valueColor: string;
  valueLabel?: string;
  onPlayerClick: (p: Player) => void;
}) {
  const maxVal = Math.max(...players.map(p => parseFloat(getValue(p))));

  return (
    <div>
      <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-2">
        {icon} {title}
      </h3>
      <div className="space-y-1.5">
        {players.map((p, idx) => (
          <button
            key={p.atleta_id}
            onClick={() => onPlayerClick(p)}
            className="w-full flex items-center gap-3 bg-gray-800/60 hover:bg-gray-700/60 border border-gray-700/40 rounded-lg px-3 py-2 transition-colors"
          >
            <span className="text-xs text-gray-500 w-4">{idx + 1}.</span>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${POS_COLORS[p.posicao_id]} text-white`}>
              {POS_NAMES[p.posicao_id]}
            </span>
            <img src={p.foto?.replace('FORMATO', '30x30') || ''} alt={p.apelido} className="w-6 h-6 rounded-full" />
            <span className="text-sm text-white flex-1 text-left truncate">{p.apelido}</span>
            <div className="w-16">
              <MiniBar value={parseFloat(getValue(p))} max={maxVal} color={valueColor.replace('text-', 'bg-')} />
            </div>
            <div className="text-right min-w-[50px]">
              <span className={`text-sm font-bold ${valueColor}`}>{getValue(p)}</span>
              {valueLabel && <span className="text-[10px] text-gray-500 ml-1">{valueLabel}</span>}
            </div>
            {getSub && <span className="text-[10px] text-gray-500 min-w-[36px] text-right">{getSub(p)}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
