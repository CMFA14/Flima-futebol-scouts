import { useState } from 'react';
import { CartolaData, CartolaMatches, FBrefClubStats, Player, PlayerMatchHistory } from '../types';
import { Trophy, Home, Plane, BarChart3 } from 'lucide-react';
import fbrefDataRaw from '../data/fbref_data.json';
import TeamModal from './TeamModal';

const fbrefData = fbrefDataRaw as unknown as Record<string, FBrefClubStats>;

type Filter = 'geral' | 'casa' | 'fora';

interface TableRow {
  abbr: string;
  nome: string;
  pts: number;
  jogos: number;
  vitorias: number;
  empates: number;
  derrotas: number;
  gols_pro: number;
  gols_contra: number;
  saldo: number;
  pts_avg: number;
}

interface Props {
  data: CartolaData;
  matches: CartolaMatches;
  history: Record<number, PlayerMatchHistory[]>;
  onPlayerClick: (p: Player) => void;
}

function buildRows(filter: Filter): TableRow[] {
  const rows: TableRow[] = [];

  Object.entries(fbrefData).forEach(([abbr, team]) => {
    const ha = team.home_away;
    if (!ha) return;

    let row: TableRow;

    if (filter === 'casa') {
      const j = ha.home_games || 0;
      row = {
        abbr,
        nome: team.nome_fbref || ha.team || abbr,
        pts: ha.home_points || 0,
        jogos: j,
        vitorias: ha.home_wins || 0,
        empates: ha.home_ties || 0,
        derrotas: ha.home_losses || 0,
        gols_pro: ha.home_goals_for || 0,
        gols_contra: ha.home_goals_against || 0,
        saldo: ha.home_goal_diff || 0,
        pts_avg: ha.home_points_avg || 0,
      };
    } else if (filter === 'fora') {
      const j = ha.away_games || 0;
      row = {
        abbr,
        nome: team.nome_fbref || ha.team || abbr,
        pts: ha.away_points || 0,
        jogos: j,
        vitorias: ha.away_wins || 0,
        empates: ha.away_ties || 0,
        derrotas: ha.away_losses || 0,
        gols_pro: ha.away_goals_for || 0,
        gols_contra: ha.away_goals_against || 0,
        saldo: ha.away_goal_diff || 0,
        pts_avg: ha.away_points_avg || 0,
      };
    } else {
      const hj = ha.home_games || 0;
      const aj = ha.away_games || 0;
      const j = hj + aj;
      const pts = (ha.home_points || 0) + (ha.away_points || 0);
      const gp = (ha.home_goals_for || 0) + (ha.away_goals_for || 0);
      const gc = (ha.home_goals_against || 0) + (ha.away_goals_against || 0);
      row = {
        abbr,
        nome: team.nome_fbref || ha.team || abbr,
        pts,
        jogos: j,
        vitorias: (ha.home_wins || 0) + (ha.away_wins || 0),
        empates: (ha.home_ties || 0) + (ha.away_ties || 0),
        derrotas: (ha.home_losses || 0) + (ha.away_losses || 0),
        gols_pro: gp,
        gols_contra: gc,
        saldo: gp - gc,
        pts_avg: j > 0 ? Math.round((pts / j) * 100) / 100 : 0,
      };
    }

    rows.push(row);
  });

  rows.sort((a, b) => b.pts - a.pts || b.saldo - a.saldo || b.gols_pro - a.gols_pro);
  return rows;
}

export default function LeagueTable({ data, matches, history, onPlayerClick }: Props) {
  const [filter, setFilter] = useState<Filter>('geral');
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const rows = buildRows(filter);

  const filterButtons: { key: Filter; label: string; icon: typeof BarChart3 }[] = [
    { key: 'geral', label: 'Geral', icon: BarChart3 },
    { key: 'casa', label: 'Em Casa', icon: Home },
    { key: 'fora', label: 'Fora', icon: Plane },
  ];

  const handleTeamClick = (abbr: string) => {
    const clubId = Object.keys(data.clubes).find(k => data.clubes[k].abreviacao === abbr);
    if (clubId) setSelectedTeamId(Number(clubId));
  };

  return (
    <div className="p-4 sm:p-6 h-full overflow-hidden flex flex-col">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-5 gap-4">
        <div className="flex items-center">
          <Trophy className="text-orange-500 mr-3" size={28} />
          <div>
            <h2 className="text-2xl font-bold text-white">Classificação - Série A</h2>
            <p className="text-gray-400 text-sm">Clique em um time para ver detalhes</p>
          </div>
        </div>

        <div className="flex bg-gray-800 rounded-lg p-1 border border-gray-700">
          {filterButtons.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                filter === key
                  ? 'bg-orange-600 text-white shadow-lg'
                  : 'text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden flex-1 flex flex-col">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-gray-900 text-gray-400 text-xs uppercase font-semibold sticky top-0">
              <tr>
                <th className="px-4 py-3 text-center w-12">#</th>
                <th className="px-4 py-3">Clube</th>
                <th className="px-4 py-3 text-center w-12">PTS</th>
                <th className="px-3 py-3 text-center w-10">J</th>
                <th className="px-3 py-3 text-center w-10 hidden sm:table-cell">V</th>
                <th className="px-3 py-3 text-center w-10 hidden sm:table-cell">E</th>
                <th className="px-3 py-3 text-center w-10 hidden sm:table-cell">D</th>
                <th className="px-3 py-3 text-center w-10 hidden md:table-cell">GP</th>
                <th className="px-3 py-3 text-center w-10 hidden md:table-cell">GC</th>
                <th className="px-3 py-3 text-center w-10 hidden sm:table-cell">SG</th>
                <th className="px-3 py-3 text-center w-14 hidden lg:table-cell">Aprov.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/50">
              {rows.map((row, idx) => {
                const pos = idx + 1;
                const fbrefToCartola: Record<string, string> = {
                  'Coritiba': 'CFC',
                  'RB Bragantino': 'RBB',
                  'Bragantino': 'RBB',
                  'Santos': 'SAN',
                  'Mirassol': 'MIR',
                  'Remo': 'REM',
                  'Chapecoense': 'CHA',
                  'Botafogo (RJ)': 'BOT',
                  'Vasco da Gama': 'VAS'
                };

                const normalizedAbbr = fbrefToCartola[row.abbr] || row.abbr;
                const cartolaClubId = Object.keys(data.clubes).find(k => data.clubes[k].abreviacao === normalizedAbbr);
                
                const club = cartolaClubId ? data.clubes[cartolaClubId] : null;
                const escudo = club?.escudos?.['30x30'] || 'https://s3.amazonaws.com/escudos.cartolafc.globo.com/default.png';

                let positionColor = 'text-gray-400';
                let borderLeft = '';
                if (pos <= 4) { positionColor = 'text-blue-400 font-bold'; borderLeft = 'border-l-2 border-l-blue-400'; }
                else if (pos <= 6) { positionColor = 'text-cyan-400'; borderLeft = 'border-l-2 border-l-cyan-400'; }
                else if (pos <= 12) { positionColor = 'text-green-400'; borderLeft = 'border-l-2 border-l-green-400'; }
                else if (pos >= 17) { positionColor = 'text-red-500 font-bold'; borderLeft = 'border-l-2 border-l-red-500'; }

                const aprovPercent = row.jogos > 0
                  ? Math.round((row.pts / (row.jogos * 3)) * 100)
                  : 0;

                return (
                  <tr
                    key={row.abbr}
                    className={`hover:bg-gray-700/30 transition-colors cursor-pointer ${borderLeft}`}
                    onClick={() => handleTeamClick(row.abbr)}
                  >
                    <td className={`px-4 py-3 text-center ${positionColor}`}>{pos}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <img src={escudo} alt={row.nome} className="w-6 h-6 object-contain" />
                        <span className="font-semibold text-white hover:text-orange-400 transition-colors">{row.nome}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center font-bold text-white bg-gray-900/40">{row.pts}</td>
                    <td className="px-3 py-3 text-center text-gray-300">{row.jogos}</td>
                    <td className="px-3 py-3 text-center text-gray-400 hidden sm:table-cell">{row.vitorias}</td>
                    <td className="px-3 py-3 text-center text-gray-400 hidden sm:table-cell">{row.empates}</td>
                    <td className="px-3 py-3 text-center text-gray-400 hidden sm:table-cell">{row.derrotas}</td>
                    <td className="px-3 py-3 text-center text-gray-400 hidden md:table-cell">{row.gols_pro}</td>
                    <td className="px-3 py-3 text-center text-gray-400 hidden md:table-cell">{row.gols_contra}</td>
                    <td className={`px-3 py-3 text-center font-medium hidden sm:table-cell ${row.saldo > 0 ? 'text-green-400' : row.saldo < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                      {row.saldo > 0 ? `+${row.saldo}` : row.saldo}
                    </td>
                    <td className="px-3 py-3 text-center hidden lg:table-cell">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        aprovPercent >= 60 ? 'bg-green-900/40 text-green-400' :
                        aprovPercent >= 40 ? 'bg-yellow-900/40 text-yellow-400' :
                        'bg-red-900/40 text-red-400'
                      }`}>
                        {aprovPercent}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="bg-gray-900/50 p-3 text-xs text-gray-400 flex flex-wrap gap-4 border-t border-gray-700">
          <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-blue-400"></div> Libertadores</div>
          <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-cyan-400"></div> Pré-Libertadores</div>
          <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-green-400"></div> Sul-Americana</div>
          <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-red-500"></div> Rebaixamento</div>
        </div>
      </div>

      {/* Team Modal */}
      {selectedTeamId && (
        <TeamModal
          clubeId={selectedTeamId}
          data={data}
          matches={matches}
          history={history}
          onClose={() => setSelectedTeamId(null)}
          onPlayerClick={onPlayerClick}
        />
      )}
    </div>
  );
}
