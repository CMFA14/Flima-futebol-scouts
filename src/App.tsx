import { useState, useEffect } from 'react';
import { fetchMercado, fetchPartidas, fetchMercadoStatus, fetchPlayerHistory } from './services/api';
import { supabase } from './services/supabase';
import { CartolaData, CartolaMatches, MercadoStatus, PlayerMatchHistory } from './types';
import { Users, BarChart2, AlertTriangle, Trophy, Activity, Swords, DollarSign, Bot, ClipboardList, Star, BrainCircuit } from 'lucide-react';
import LineupGenerator from './components/LineupGenerator';
import ScoutPanel from './components/ScoutPanel';
import RiskPanel from './components/RiskPanel';
import LeagueTable from './components/LeagueTable';
import ParciaisPanel from './components/ParciaisPanel';
import MatchPredictions from './components/MatchPredictions';
import BettingTips from './components/BettingTips';
import GoldenTips from './components/GoldenTips';
import MatchList from './components/MatchList';
import Header from './components/Header';
import AIPromptTab from './components/AIPromptTab';
import TeamLineups from './components/TeamLineups';
import PlayerModal from './components/PlayerModal';
import LandingPage from './components/LandingPage';
import MachineLearningPanel from './components/MachineLearningPanel';
import { Player } from './types';
import { AILineupResponse, BettingTipsResponse } from './services/aiPrompts';

function App() {
  const [data, setData] = useState<CartolaData | null>(null);
  const [matches, setMatches] = useState<CartolaMatches | null>(null);
  const [mercadoStatus, setMercadoStatus] = useState<MercadoStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'lineup' | 'scout' | 'risk' | 'table' | 'parciais' | 'predictions' | 'betting' | 'prompt' | 'lineups' | 'golden-tips' | 'ml'>('lineup');
  const [manualAiResponse, setManualAiResponse] = useState<AILineupResponse | null>(null);
  const [manualBettingResponse, setManualBettingResponse] = useState<BettingTipsResponse | null>(null);
  const [globalSelectedPlayer, setGlobalSelectedPlayer] = useState<Player | null>(null);
  const [playerHistory, setPlayerHistory] = useState<Record<number, PlayerMatchHistory[]>>({});
  const [showLanding, setShowLanding] = useState(true);

  useEffect(() => {
    // Check Supabase session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setShowLanding(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) setShowLanding(false);
      else setShowLanding(true);
    });

    const loadData = async () => {
      try {
        const [mercadoData, partidasData, statusData] = await Promise.all([
          fetchMercado(),
          fetchPartidas(),
          fetchMercadoStatus()
        ]);
        setData(mercadoData);
        setMatches(partidasData);
        setMercadoStatus(statusData);
        
        // Se o mercado não estiver aberto (1), a aba principal vira Parciais
        if (statusData && statusData.status_mercado !== 1) {
          setActiveTab('parciais');
        }

        // Fetch do Histórico Assíncrono para os Modais sem bloquear UI inicial
        if (partidasData && partidasData.rodada) {
           fetchPlayerHistory(partidasData.rodada, 5).then(history => {
              setPlayerHistory(history);
           }).catch(err => console.log('Player History failed silently:', err));
        }

      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  if (showLanding) {
    return <LandingPage onEnter={() => setShowLanding(false)} onGuestEnter={() => setShowLanding(false)} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  if (!data || !matches) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white">
        <p>Erro ao carregar dados do Cartola FC. Tente novamente mais tarde.</p>
      </div>
    );
  }

  const tabsConfig = [
    { id: 'lineup', label: 'Escalação Ideal', icon: Users, activeClasses: 'bg-gradient-to-r from-orange-600 to-orange-500 text-white shadow-lg shadow-orange-900/50 border-orange-500/50' },
    { id: 'lineups', label: 'Escalações', icon: ClipboardList, activeClasses: 'bg-gradient-to-r from-teal-600 to-teal-500 text-white shadow-lg shadow-teal-900/50 border-teal-500/50' },
    ...(mercadoStatus && mercadoStatus.status_mercado !== 1 ? [{ id: 'parciais', label: 'Parciais ao Vivo', icon: Activity, activeClasses: 'bg-gradient-to-r from-green-600 to-green-500 text-white shadow-lg shadow-green-900/50 border-green-500/50' }] : []),
    { id: 'scout', label: 'Top Scouts', icon: BarChart2, activeClasses: 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-900/50 border-blue-500/50' },
    { id: 'table', label: 'Classificação', icon: Trophy, activeClasses: 'bg-gradient-to-r from-yellow-600 to-yellow-500 text-white shadow-lg shadow-yellow-900/50 border-yellow-500/50' },
    { id: 'risk', label: 'Radar Risco', icon: AlertTriangle, activeClasses: 'bg-gradient-to-r from-red-600 to-red-500 text-white shadow-lg shadow-red-900/50 border-red-500/50' },
    { id: 'predictions', label: 'Previsões', icon: Swords, activeClasses: 'bg-gradient-to-r from-purple-600 to-purple-500 text-white shadow-lg shadow-purple-900/50 border-purple-500/50' },
    { id: 'golden-tips', label: 'Dicas de Ouro', icon: Star, activeClasses: 'bg-gradient-to-r from-yellow-600 to-yellow-500 text-white shadow-lg shadow-yellow-900/50 border-yellow-500/50' },
    { id: 'betting', label: 'Apostas', icon: DollarSign, activeClasses: 'bg-gradient-to-r from-emerald-600 to-emerald-500 text-white shadow-lg shadow-emerald-900/50 border-emerald-500/50' },
    { id: 'prompt', label: 'Prompt IA', icon: Bot, activeClasses: 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white shadow-lg shadow-indigo-900/50 border-indigo-500/50' },
    { id: 'ml', label: 'IA Interna', icon: BrainCircuit, activeClasses: 'bg-gradient-to-r from-cyan-600 to-blue-500 text-white shadow-lg shadow-cyan-900/50 border-cyan-500/50' },
  ];

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 font-sans">
      <Header />
      
      <main className="w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <nav className="relative mb-8 z-10 w-full">
          <div className="flex gap-2 sm:gap-3 overflow-x-auto md:overflow-x-visible md:flex-wrap pb-4 pt-2 -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-hide snap-x font-sans">
             {tabsConfig.map((tab) => {
               const Icon = tab.icon;
               const isActive = activeTab === tab.id;
               return (
                 <button
                   key={tab.id}
                   onClick={() => setActiveTab(tab.id as any)}
                   className={`flex items-center space-x-2.5 px-5 py-3 rounded-xl font-semibold transition-all duration-300 whitespace-nowrap flex-shrink-0 snap-start border ${
                     isActive
                       ? tab.activeClasses
                       : 'bg-gray-800/80 text-gray-400 border-gray-700/60 hover:bg-gray-700 hover:text-white hover:border-gray-500'
                   }`}
                   style={isActive ? { transform: 'scale(1.02)' } : {}}
                 >
                   <Icon size={18} className={`transition-opacity ${isActive ? 'opacity-100' : 'opacity-70'}`} />
                   <span>{tab.label}</span>
                 </button>
               );
             })}
          </div>
          {/* Subtle gradient fades for scrolling indicators on mobile */}
          <div className="absolute top-0 right-0 bottom-4 w-12 bg-gradient-to-l from-gray-900 to-transparent pointer-events-none rounded-r-lg" />
        </nav>

        <div className="flex flex-col lg:flex-row gap-6">

          {/* Centro: Conteúdo Principal */}
          <div className="flex-1 bg-gray-800 rounded-xl shadow-xl overflow-hidden border border-gray-700 min-w-0">
            {activeTab === 'lineup' && <LineupGenerator data={data} matches={matches} manualAiLineup={manualAiResponse} onPlayerClick={setGlobalSelectedPlayer} history={playerHistory} />}
            {activeTab === 'scout' && <ScoutPanel data={data} onPlayerClick={setGlobalSelectedPlayer} />}
            {activeTab === 'risk' && <RiskPanel data={data} />}
            {activeTab === 'table' && <LeagueTable data={data} matches={matches} history={playerHistory} onPlayerClick={setGlobalSelectedPlayer} />}
            {/* ParciaisPanel fica sempre montado para preservar estado ao trocar de aba */}
            <div className={activeTab === 'parciais' ? '' : 'hidden'}>
              <ParciaisPanel data={data} onPlayerClick={setGlobalSelectedPlayer} />
            </div>
            {activeTab === 'predictions' && <MatchPredictions data={data} matches={matches} />}
            {activeTab === 'golden-tips' && <GoldenTips data={data} matches={matches} onPlayerClick={setGlobalSelectedPlayer} history={playerHistory} />}
            {activeTab === 'betting' && <BettingTips data={data} matches={matches} manualBettingTips={manualBettingResponse} />}
            {activeTab === 'lineups' && <TeamLineups data={data} matches={matches} onPlayerClick={setGlobalSelectedPlayer} />}
            {activeTab === 'prompt' && <AIPromptTab data={data} matches={matches} onApplyLineup={(res) => {
              setManualAiResponse(res);
              setActiveTab('lineup');
            }} onApplyBettingTips={(res) => {
              setManualBettingResponse(res);
              setActiveTab('betting');
            }} />}
            {activeTab === 'ml' && <MachineLearningPanel data={data} matches={matches} onPlayerClick={setGlobalSelectedPlayer} />}
          </div>

          {/* Direita: Partidas no Celular ou Apenas Sidebar na WEB */}
          <div className="flex flex-col w-full lg:w-[280px] xl:w-[320px] 2xl:w-[360px] flex-shrink-0 space-y-6">
            <MatchList matches={matches.partidas} clubes={data.clubes} rodada={matches.rodada} />
          </div>
        </div>
      </main>

        {globalSelectedPlayer && (
          <PlayerModal 
            player={globalSelectedPlayer} 
            onClose={() => setGlobalSelectedPlayer(null)} 
            clubes={data.clubes} 
            posicoes={data.posicoes}
            matches={matches || undefined}
            history={playerHistory[globalSelectedPlayer.atleta_id] || []}
          />
        )}
    </div>
  );
}

export default App;
