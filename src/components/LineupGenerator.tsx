import { useState, useMemo, useEffect } from 'react';
import { CartolaData, CartolaMatches, Player, PlayerMatchHistory } from '../types';
import { buildBestTeam, findBestFormation, FORMATIONS, FORMATION_IDS, ProjectedPlayer, TeamSelection } from '../utils/engine';
import { generateProjections, getProjections } from '../services/mlEngine';
import { submitLineup } from '../services/api';
import { AILineupResponse } from '../services/aiPrompts';
import LoginModal from './LoginModal';
import { Shield, Target, Users, Star, LayoutGrid, List, Send, Flame } from 'lucide-react';

interface Props {
  data: CartolaData;
  matches: CartolaMatches;
  manualAiLineup?: AILineupResponse | null;
  history: Record<number, PlayerMatchHistory[]>;
  onPlayerClick?: (player: Player) => void;
}

export default function LineupGenerator({ data, matches, manualAiLineup, history, onPlayerClick }: Props) {
  const [formation, setFormation] = useState<string>('4-3-3');
  const [budget, setBudget] = useState<number>(140);
  const [viewMode, setViewMode] = useState<'list' | 'pitch'>('pitch');
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [aiTeam, setAiTeam] = useState<TeamSelection | null>(null);

  const formationsList = Object.keys(FORMATIONS);

  useEffect(() => {
    // Reset AI team if user manually changes budget or formation after generating
    setAiTeam(null);
  }, [budget, formation]);

  const engineProjected = useMemo(() => {
    let mlProjections = getProjections(matches.rodada);
    if (!mlProjections || mlProjections.length === 0) {
      mlProjections = generateProjections(data, matches);
    }
    
    return mlProjections.map(mlP => {
      const originalPlayer = data.atletas.find(a => a.atleta_id === mlP.atleta_id);
      if (!originalPlayer) return null;
      return {
        ...originalPlayer,
        projectedPoints: mlP.expected_points,
        matchMultiplier: mlP.expected_points / (mlP.media_base || 1), 
      } as ProjectedPlayer;
    }).filter(Boolean).sort((a, b) => (b as ProjectedPlayer).projectedPoints - (a as ProjectedPlayer).projectedPoints) as ProjectedPlayer[];
  }, [data, matches]);

  useEffect(() => {
    if (manualAiLineup && engineProjected.length > 0) {
      if (formationsList.includes(manualAiLineup.formacao)) {
        setFormation(manualAiLineup.formacao);
      }
      
      const projectedDict = new Map(engineProjected.map(p => [p.atleta_id, p]));
      
      const starters = manualAiLineup.titulares.map(id => projectedDict.get(id)).filter(Boolean) as ProjectedPlayer[];
      const reserves = manualAiLineup.reservas.map(id => projectedDict.get(id)).filter(Boolean) as ProjectedPlayer[];
      const captain = projectedDict.get(manualAiLineup.capitao) || null;

      setAiTeam({ starters, reserves, captain });
    }
  }, [manualAiLineup, engineProjected]);

  const baseTeam = useMemo(() => {
    // O robô de Inteligência tenta montar considerando apenas Prováveis (status === 7) para titulares
    // Técnicos quase sempre têm status 7, mas garantimos que ele não será filtrado pela regra
    const safePlayers = engineProjected.filter(p => p.status_id === 7 || p.posicao_id === 6);
    return buildBestTeam(safePlayers, formation, budget, history);
  }, [engineProjected, formation, budget, history]);

  const team = aiTeam || baseTeam;



  const executeSubmit = async (token: string) => {
    setIsSubmitting(true);
    try {
      const payload = {
        esquema: FORMATION_IDS[formation],
        atletas: team.starters.map(p => p.atleta_id),
        capitao: team.captain?.atleta_id,
      };
      
      await submitLineup(token, payload);
      alert('✅ Escalação aplicada com sucesso no Cartola FC oficial!');
      return true;
    } catch (err: any) {
      const msg = err.message || '';
      console.error('Erro de submissão lineup:', msg);
      if (msg.toLowerCase().includes('autentica') || msg.toLowerCase().includes('autoriz') || msg.includes('AUTH_ERROR')) {
        localStorage.removeItem('cartola_glb_token');
        alert('❌ Servidor do Cartola FC rejeitou o Token. O Token está vazio, inválido ou expirado.');
        setIsLoginModalOpen(true); // Token inválido, abre modal
      } else {
        alert('❌ Erro da API do Cartola: ' + msg);
      }
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApplyLineupClick = async () => {
    const savedToken = localStorage.getItem('cartola_glb_token');
    if (savedToken) {
      await executeSubmit(savedToken);
    } else {
      setIsLoginModalOpen(true);
    }
  };

  const handleLoginSuccess = async (token: string) => {
    setIsLoginModalOpen(false);
    localStorage.setItem('cartola_glb_token', token);
    await executeSubmit(token);
  };

  const totalCost = team.starters.reduce((acc, p) => acc + p.preco_num, 0);
  const totalProjected = team.starters.reduce((acc, p) => acc + p.projectedPoints, 0);

  const renderPlayer = (player: ProjectedPlayer, isCaptain = false) => {
    const club = data.clubes[player.clube_id];
    const pos = data.posicoes[player.posicao_id];
    const photo = player.foto ? player.foto.replace('FORMATO', '140x140') : 'https://s2-cartola.glbimg.com/aA-HwH-zL-_0R1894u1k3wD8FDU=/140x140/smart/filters:strip_icc()/https://s2.glbimg.com/OqD0yBlyf-rR_TfM-tW7Q5Y3JtU=/https://s3.amazonaws.com/escudos.cartolafc.globo.com/default-player.png';
    const clubEscudo = club?.escudos?.['60x60'];

    return (
      <div key={player.atleta_id} onClick={() => onPlayerClick?.(player)} className="bg-gray-700/50 rounded-lg p-3 flex items-center gap-3 relative overflow-hidden group hover:bg-gray-700 transition-colors cursor-pointer">
        <div className="relative">
          <img src={photo} alt={player.apelido} className="w-12 h-12 rounded-full object-cover bg-gray-600" />
          {clubEscudo && (
            <img src={clubEscudo} alt={club?.nome} className="w-5 h-5 absolute -bottom-1 -right-1" />
          )}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="font-semibold text-white truncate text-sm">{player.apelido}</h4>
            {isCaptain && (
              <span className="bg-orange-500 text-xs text-white font-bold px-1.5 py-0.5 rounded flex items-center">
                <Star size={10} className="mr-1" /> C
              </span>
            )}
          </div>
          <div className="flex items-center text-xs text-gray-400 gap-2 mt-1">
            <span className="bg-gray-600 px-1.5 rounded text-gray-200">{pos?.abreviacao}</span>
            <span>C$ {player.preco_num.toFixed(1)}</span>
          </div>
          <div className="text-right flex-shrink-0 ml-2">
            <div className="text-sm font-bold text-green-400 whitespace-nowrap flex items-center justify-end gap-1">
              {player.projectedPoints.toFixed(2)} pts
              {player.matchMultiplier > 1.05 && (
                <span title="Matchup Favorável">
                  <Flame size={14} className="text-orange-500" />
                </span>
              )}
            </div>
            <div className="text-[10px] sm:text-xs text-gray-500 whitespace-nowrap">Média: {player.media_num.toFixed(1)}</div>
          </div>
        </div>
      </div>
    );
  };

  const renderPlayerPitch = (player: ProjectedPlayer, isCaptain = false) => {
    const photo = player.foto ? player.foto.replace('FORMATO', '140x140') : 'https://s2-cartola.glbimg.com/aA-HwH-zL-_0R1894u1k3wD8FDU=/140x140/smart/filters:strip_icc()/https://s2.glbimg.com/OqD0yBlyf-rR_TfM-tW7Q5Y3JtU=/https://s3.amazonaws.com/escudos.cartolafc.globo.com/default-player.png';
    
    return (
      <div key={player.atleta_id} onClick={() => onPlayerClick?.(player)} className="flex flex-col items-center justify-center w-14 sm:w-20 group relative cursor-pointer">
        <div className="relative">
          <img src={photo} alt={player.apelido} className="w-10 h-10 sm:w-12 sm:h-12 rounded-full border-2 border-gray-800 bg-gray-800 object-cover shadow-lg group-hover:scale-110 transition-transform" />
          {isCaptain && (
            <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-orange-500 text-[10px] text-white font-bold px-1 rounded-sm border border-orange-700 z-10 w-fit drop-shadow-md">
              C
            </span>
          )}
        </div>
        <div className="mt-1.5 bg-gray-900/90 px-1 py-0.5 rounded text-[9px] sm:text-xs text-white font-semibold truncate w-full text-center border border-gray-700 shadow max-w-[80px]">
          {player.apelido}
        </div>
        <div className="text-[10px] sm:text-xs font-black text-white bg-green-900/80 px-1.5 py-0.5 rounded mt-0.5 shadow flex items-center gap-0.5">
          {player.projectedPoints.toFixed(1)}
          {player.matchMultiplier > 1.05 && <Flame size={10} className="text-orange-500" />}
        </div>
      </div>
    );
  };

  const renderPitchView = () => {
    const attackers = team.starters.filter(p => p.posicao_id === 5);
    const midfielders = team.starters.filter(p => p.posicao_id === 4);
    const lats = team.starters.filter(p => p.posicao_id === 2);
    const zags = team.starters.filter(p => p.posicao_id === 3);

    let defenders: typeof team.starters = [];
    if (lats.length >= 2) {
      defenders = [lats[0], ...zags, lats[1]];
    } else if (lats.length === 1) {
      defenders = [lats[0], ...zags];
    } else {
      defenders = [...zags];
    }
    
    const goalkeeper = team.starters.filter(p => p.posicao_id === 1);
    const coach = team.starters.find(p => p.posicao_id === 6);

    return (
      <div className="relative bg-gradient-to-b from-green-700 to-green-800 rounded-xl overflow-hidden aspect-[4/5] sm:aspect-square md:aspect-[4/5] lg:aspect-[3/4] border border-gray-700 select-none shadow-inner w-full max-w-lg mx-auto">
        
        {/* Field lines decoration */}
        <div className="absolute inset-x-4 inset-y-4 border border-white/30 pointer-events-none"></div>
        <div className="absolute top-4 left-1/2 -translate-x-1/2 w-32 sm:w-48 h-16 sm:h-20 border border-white/30 border-t-0 pointer-events-none"></div>
        <div className="absolute top-4 left-1/2 -translate-x-1/2 w-16 sm:w-24 h-6 sm:h-8 border border-white/30 border-t-0 pointer-events-none"></div>
        
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-32 sm:w-48 h-16 sm:h-20 border border-white/30 border-b-0 pointer-events-none"></div>
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-16 sm:w-24 h-6 sm:h-8 border border-white/30 border-b-0 pointer-events-none"></div>
        
        <div className="absolute top-1/2 left-4 right-4 border-t border-white/30 pointer-events-none"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 sm:w-28 h-20 sm:h-28 rounded-full border border-white/30 pointer-events-none"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 sm:w-1.5 h-1 sm:h-1.5 rounded-full bg-white/50 pointer-events-none"></div>

        {/* Players Layout */}
        <div className="absolute inset-0 flex flex-col justify-evenly py-6">
          <div className="flex justify-center gap-1 sm:gap-6 z-10 w-full px-2">
            {attackers.map(p => renderPlayerPitch(p, p.atleta_id === team.captain?.atleta_id))}
          </div>
          <div className="flex justify-center gap-1 sm:gap-6 z-10 w-full px-2">
            {midfielders.map(p => renderPlayerPitch(p, p.atleta_id === team.captain?.atleta_id))}
          </div>
          <div className="flex justify-center gap-1 sm:gap-6 z-10 w-full px-2">
            {defenders.map(p => renderPlayerPitch(p, p.atleta_id === team.captain?.atleta_id))}
          </div>
          <div className="flex justify-center z-10 relative mt-2">
            {goalkeeper.map(p => renderPlayerPitch(p, p.atleta_id === team.captain?.atleta_id))}
            
            {coach && (
              <div className="absolute bottom-2 right-4 sm:right-8 lg:right-4 opacity-90 pb-2">
                <div className="text-[9px] text-white/80 mb-0.5 text-center font-bold uppercase tracking-widest bg-black/40 px-1 rounded-sm w-fit mx-auto">Técnico</div>
                {renderPlayerPitch(coach, coach.atleta_id === team.captain?.atleta_id)}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const positionsOrder = [6, 1, 2, 3, 4, 5]; // Coach, GK, LAT, ZAG, MID, ATA

  return (
    <div className="p-4 sm:p-6">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-8 gap-6">
        <div>
          <h2 className="text-2xl font-bold text-white mb-2 flex items-center">
            <Target className="mr-2 text-orange-500" /> Time Ideal
          </h2>
          <p className="text-gray-400">Escalação sugerida baseada em médias e confrontos da rodada</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          <div className="flex bg-gray-900 p-1 rounded-lg border border-gray-700">
            <button 
              onClick={() => setViewMode('pitch')}
              className={`p-2 rounded-md transition-colors ${viewMode === 'pitch' ? 'bg-orange-600 text-white' : 'text-gray-400 hover:text-white'}`}
              title="Visão de Campo"
            >
              <LayoutGrid size={18} />
            </button>
            <button 
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-md transition-colors ${viewMode === 'list' ? 'bg-orange-600 text-white' : 'text-gray-400 hover:text-white'}`}
              title="Visão em Lista"
            >
              <List size={18} />
            </button>
          </div>

          <div className="flex flex-1 sm:flex-none bg-gray-900 p-1.5 rounded-lg border border-gray-700 items-center justify-between gap-2 sm:gap-4">
            <div className="flex items-center">
              <span className="px-2 sm:px-3 text-xs sm:text-sm text-gray-400 font-medium whitespace-nowrap">Cartoletas:</span>
              <input 
                type="number" 
                value={budget} 
                onChange={(e) => setBudget(Number(e.target.value) || 0)}
                className="bg-gray-800 text-white border-none rounded-md py-1 px-1 sm:px-2 focus:ring-1 focus:ring-orange-500 outline-none w-16 sm:w-20 font-semibold text-center text-sm"
              />
            </div>
            <div className="flex items-center border-l border-gray-700 pl-2 sm:pl-4">
              <span className="px-1 sm:px-2 text-xs sm:text-sm text-gray-400 font-medium whitespace-nowrap">Esquema:</span>
              <select 
                value={formation} 
                onChange={(e) => setFormation(e.target.value)}
                className="bg-gray-800 text-white border-none rounded-md py-1 px-1 sm:px-2 focus:ring-1 focus:ring-orange-500 outline-none font-semibold cursor-pointer text-sm"
              >
                {formationsList.map(f => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
              <button
                onClick={() => {
                  const safePlayers = engineProjected.filter(p => p.status_id === 7 || p.posicao_id === 6);
                  const best = findBestFormation(safePlayers, budget, history);
                  setFormation(best.formation);
                }}
                className="ml-1 sm:ml-2 px-2 py-1 bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold rounded transition-colors"
                title="Encontrar melhor formação automaticamente"
              >
                AUTO
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 flex flex-col sm:flex-row justify-around items-center divide-y sm:divide-y-0 sm:divide-x divide-gray-700 gap-4 sm:gap-0">
            <div className="flex w-full justify-around sm:w-2/3 divide-x divide-gray-700">
              <div className="text-center px-4 w-1/2">
                <div className="text-sm text-gray-400 mb-1">Custo Total</div>
                <div className="text-xl font-bold text-white">C$ {totalCost.toFixed(1)}</div>
              </div>
              <div className="text-center px-4 w-1/2">
                <div className="text-sm text-gray-400 mb-1">Proj. Pontos</div>
                <div className="text-xl font-bold text-green-400">{totalProjected.toFixed(1)}</div>
              </div>
            </div>
            <div className="w-full sm:w-1/3 pt-4 sm:pt-0 sm:px-4 flex justify-center">
              <button
                onClick={handleApplyLineupClick}
                disabled={isSubmitting}
                className="w-full sm:w-auto flex items-center justify-center space-x-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg font-bold transition-colors shadow-lg shadow-orange-900/20"
              >
                {isSubmitting ? (
                  <span className="animate-pulse">Aplicando...</span>
                ) : (
                  <>
                    <Send size={18} />
                    <span>Aplicar Escalação 🔥</span>
                  </>
                )}
              </button>
            </div>
          </div>

            <div className="bg-gray-800 rounded-xl">
              <h3 className="text-lg font-bold text-white mb-4 flex items-center">
                <Shield className="mr-2 text-gray-400" size={20} /> Titulares
              </h3>
              
              {viewMode === 'list' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {positionsOrder.map(posId => {
                    const playersInPos = team.starters.filter(p => p.posicao_id === posId);
                    return playersInPos.map(p => renderPlayer(p, p.atleta_id === team.captain?.atleta_id));
                  })}
                </div>
              ) : (
                renderPitchView()
              )}
            </div>
        </div>

        <div>
          <h3 className="text-lg font-bold text-white mb-4 flex items-center">
            <Users className="mr-2 text-gray-400" size={20} /> Banco de Reservas
          </h3>
          <div className="flex flex-col gap-3">
            {positionsOrder.map(posId => {
              const res = team.reserves.find(p => p.posicao_id === posId);
              if (!res) return null;
              return (
                <div key={res.atleta_id}>
                  <div className="text-xs text-gray-500 mb-1 uppercase font-semibold">{data.posicoes[posId]?.nome}</div>
                  {renderPlayer(res)}
                </div>
              );
            })}
            {team.reserves.length === 0 && (
              <div className="text-gray-400 text-sm italic">Nenhum reserva selecionado.</div>
            )}
          </div>
        </div>
      </div>
      
      <LoginModal 
        isOpen={isLoginModalOpen} 
        onClose={() => setIsLoginModalOpen(false)} 
        onSuccess={handleLoginSuccess}
        requireTokenOnly={true}
      />
    </div>
  );
}
