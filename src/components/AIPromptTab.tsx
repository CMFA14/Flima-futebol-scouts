import { useState, useMemo } from 'react';
import { CartolaData, CartolaMatches, PlayerMatchHistory } from '../types';
import { getLineupPrompt, getBettingTipsPrompt, AILineupResponse, BettingTipsResponse } from '../services/aiPrompts';
import { generateProjections, getProjections, getEvaluation } from '../services/mlEngine';
import { generateGoldenTips } from '../utils/crossStats';
import { Bot, Copy, Check, Info, Upload, Users, DollarSign } from 'lucide-react';

interface Props {
  data: CartolaData;
  matches: CartolaMatches;
  history?: Record<number, PlayerMatchHistory[]>;
  onApplyLineup: (res: AILineupResponse) => void;
  onApplyBettingTips: (res: BettingTipsResponse) => void;
}

export default function AIPromptTab({ data, matches, history, onApplyLineup, onApplyBettingTips }: Props) {
  const [mode, setMode] = useState<'lineup' | 'betting'>('lineup');
  const [budget, setBudget] = useState<number>(140);
  const [copied, setCopied] = useState(false);
  const [jsonInput, setJsonInput] = useState('');

  // Enriquecimento com dados do motor: projeções (ML), tips (crossStats) e avaliação anterior
  const engineContext = useMemo(() => {
    const projections = getProjections(matches.rodada) || generateProjections(data, matches);
    const goldenTips = history ? generateGoldenTips(data.atletas, matches.partidas, data.clubes, history) : [];
    const lastEvaluation = matches.rodada > 1 ? getEvaluation(matches.rodada - 1) : null;
    return { projections, goldenTips, lastEvaluation, history };
  }, [data, matches, history]);

  const promptText = useMemo(() => {
    if (mode === 'lineup') {
      return getLineupPrompt(data, matches, budget, engineContext);
    } else {
      return getBettingTipsPrompt(data, matches, engineContext);
    }
  }, [data, matches, budget, mode, engineContext]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(promptText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
      // Fallback
      const textArea = document.createElement('textarea');
      textArea.value = promptText;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleImport = () => {
    try {
      const cleanJson = jsonInput.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJson);
      
      if (mode === 'lineup') {
        if (parsed.formacao && parsed.titulares && parsed.reservas && parsed.capitao) {
          onApplyLineup(parsed as AILineupResponse);
          setJsonInput('');
        } else {
          alert("JSON inválido para Escalação: Faltam campos obrigatórios (formacao, titulares, reservas, capitao).");
        }
      } else {
        if (parsed.faceis && parsed.normais && parsed.arriscadas) {
          onApplyBettingTips(parsed as BettingTipsResponse);
          setJsonInput('');
        } else {
          alert("JSON inválido para Apostas: Faltam campos obrigatórios (faceis, normais, arriscadas).");
        }
      }
    } catch {
      alert("Falha ao interpretar a resposta. Certifique-se de colar o JSON válido (incluindo as chaves { }).");
    }
  };

  return (
    <div className="p-4 sm:p-6 h-full flex flex-col">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white mb-2 flex items-center">
            <Bot className="mr-2 text-blue-400" /> Prompt IA
          </h2>
          <p className="text-gray-400">Gere o prompt exato para copiar e colar no ChatGPT, Claude ou outra IA.</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 items-center w-full sm:w-auto">
          {/* Toggle buttons */}
          <div className="flex bg-gray-900 p-1 rounded-lg border border-gray-700 w-full sm:w-auto">
            <button
              onClick={() => setMode('lineup')}
              className={`flex-1 sm:flex-none flex items-center justify-center space-x-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                mode === 'lineup' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              <Users size={16} />
              <span>Escalação</span>
            </button>
            <button
              onClick={() => setMode('betting')}
              className={`flex-1 sm:flex-none flex items-center justify-center space-x-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                mode === 'betting' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              <DollarSign size={16} />
              <span>Apostas</span>
            </button>
          </div>

          {mode === 'lineup' && (
            <div className="flex bg-gray-900 p-1.5 rounded-lg border border-gray-700 items-center justify-between gap-4 w-full sm:w-auto">
              <div className="flex items-center">
                <span className="px-3 text-sm text-gray-400 font-medium whitespace-nowrap">Cartoletas:</span>
                <input 
                  type="number" 
                  value={budget} 
                  onChange={(e) => setBudget(Number(e.target.value) || 0)}
                  className="bg-gray-800 text-white border-none rounded-md py-1 px-2 focus:ring-1 focus:ring-blue-500 outline-none w-20 font-semibold text-center text-sm"
                  min="0"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="bg-blue-900/20 border border-blue-800/50 rounded-lg p-4 mb-6 flex items-start">
        <Info className="text-blue-400 mr-3 flex-shrink-0 mt-0.5" size={20} />
        <div className="text-sm text-blue-200">
          <p className="font-semibold mb-1">Como usar:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Selecione o tipo de prompt desejado (Escalação ou Apostas).</li>
            <li>Ajuste as cartoletas, caso seja para Escalação.</li>
            <li>Clique no botão "Copiar Prompt" abaixo.</li>
            <li>Abra sua IA favorita (ChatGPT, Claude, Gemini, etc).</li>
            <li>Cole o texto gerado na caixa "Colar Resposta da IA" à direita e clique no botão de Importar.</li>
          </ul>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 min-h-[400px]">
        {/* Lado Esquerdo: Copiar Prompt */}
        <div className="bg-gray-900 rounded-xl border border-gray-700 overflow-hidden flex flex-col relative h-full">
          <div className="bg-gray-800 px-4 py-3 border-b border-gray-700 flex justify-between items-center">
            <span className="text-sm font-medium text-gray-300">Conteúdo do Prompt (Passo 1)</span>
            <button
              onClick={handleCopy}
              className={`flex items-center space-x-2 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                copied 
                  ? 'bg-green-600/20 text-green-400 border border-green-600/50' 
                  : 'bg-blue-600 hover:bg-blue-700 text-white border border-transparent'
              }`}
            >
              {copied ? (
                <>
                  <Check size={16} />
                  <span>Copiado!</span>
                </>
              ) : (
                <>
                  <Copy size={16} />
                  <span>Copiar Prompt</span>
                </>
              )}
            </button>
          </div>
          <textarea
            readOnly
            value={promptText}
            className="flex-1 w-full bg-gray-900 text-gray-300 p-4 font-mono text-sm resize-none focus:outline-none scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent h-full min-h-[300px]"
          />
        </div>

        {/* Lado Direito: Colar JSON */}
        <div className="bg-gray-900 rounded-xl border border-gray-700 overflow-hidden flex flex-col relative h-full">
          <div className="bg-gray-800 px-4 py-3 border-b border-gray-700 flex justify-between items-center">
            <span className="text-sm font-medium text-gray-300">Colar Resposta da IA (Passo 2)</span>
            <button
              onClick={handleImport}
              className="flex items-center space-x-2 px-4 py-1.5 rounded-md text-sm font-medium transition-colors bg-green-600 hover:bg-green-700 text-white border border-transparent"
            >
              <Upload size={16} />
              <span>Importar Escalação</span>
            </button>
          </div>
          <textarea
            value={jsonInput}
            onChange={(e) => setJsonInput(e.target.value)}
            placeholder={mode === 'lineup'
              ? 'Cole aqui a resposta da IA (Escalação)...\n\nExemplo:\n{\n  "formacao": "4-3-3",\n  "titulares": [110708,131516...],\n  "reservas": [82730,97795...],\n  "capitao": 95131\n}'
              : 'Cole aqui a resposta da IA (Apostas)...\n\nExemplo:\n{\n  "faceis": [...],\n  "normais": [...],\n  "arriscadas": [...]\n}'
            }
            className="flex-1 w-full bg-gray-900 text-gray-300 p-4 font-mono text-sm resize-none focus:outline-none scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent h-full min-h-[300px]"
          />
        </div>
      </div>
    </div>
  );
}
