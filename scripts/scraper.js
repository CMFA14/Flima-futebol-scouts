import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

console.log("Iniciando extração do FBref com PuppeteerJS...");

const TEAM_MAP = {
    "Flamengo": "FLA",
    "Palmeiras": "PAL",
    "Atlético Mineiro": "CAM",
    "Botafogo (RJ)": "BOT",
    "São Paulo": "SAO",
    "Fluminense": "FLU",
    "Grêmio": "GRE",
    "Internacional": "INT",
    "Athletico Paranaense": "CAP",
    "Fortaleza": "FOR",
    "Corinthians": "COR",
    "Cruzeiro": "CRU",
    "Vasco da Gama": "VAS",
    "Bahia": "BAH",
    "Vitória": "VIT",
    "Juventude": "JUV",
    "Criciúma": "CRI",
    "Atlético Goianiense": "ACG",
    "Cuiabá": "CUI",
    "Red Bull Bragantino": "RBB"
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function scrapeFBref() {
    const isCloud = process.env.GITHUB_ACTIONS === 'true';
    const browser = await puppeteer.launch({ 
        headless: true, // Forçado para evitar erros de DISPLAY em servidores/ambientes remotos
        defaultViewport: { width: 1280, height: 800 },
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox', 
            '--disable-blink-features=AutomationControlled',
            '--window-size=1280,800'
        ]
    });
    
    const fbrefDatabase = {};
    
    try {
        const page = await browser.newPage();
        
        // Stealth settings
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
            Object.defineProperty(navigator, 'languages', { get: () => ['pt-BR', 'pt', 'en-US', 'en'] });
            Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
        });

        // 1. POSSE DE BOLA
        console.log("Buscando Posse de Bola...");
        await page.goto('https://fbref.com/pt/comps/24/possession/Estatisticas-Serie-A', { 
            waitUntil: 'networkidle2',
            timeout: 60000 
        });
        await page.waitForSelector('#stats_squads_possession_for', { timeout: 60000 });

        
        const possData = await page.evaluate(() => {
            const results = [];
            const rows = document.querySelectorAll('#stats_squads_possession_for tbody tr');
            if (rows.length === 0) return [{error: "Tabela não encontrada"}];
            
            rows.forEach((row) => {
                const teamCell = row.querySelector('th[data-stat="team"], td[data-stat="team"]');
                const tklCell = row.querySelector('td[data-stat="tackled"]'); 
                const dispossCell = row.querySelector('td[data-stat="dispossessed"]'); 
                const miscontrolCell = row.querySelector('td[data-stat="miscontrols"]'); 

                if (teamCell && teamCell.textContent && teamCell.textContent !== 'Total') {
                    results.push({
                        team: teamCell.textContent.trim().replace(/^vs\s+/, ''),
                        tackled: parseInt(tklCell ? tklCell.textContent : '0') || 0,
                        dispossessed: parseInt(dispossCell ? dispossCell.textContent : '0') || 0,
                        miscontrols: parseInt(miscontrolCell ? miscontrolCell.textContent : '0') || 0
                    });
                }
            });
            return results;
        });
        
        console.log(`Encontrou ${possData.length} times em Posse.`);

        // 2. DEFESA (Interceptações e Bloqueios)
        console.log("Buscando Defesa (Interceptações e Bloqueios)...");
        await page.goto('https://fbref.com/pt/comps/24/defense/Estatisticas-Serie-A', { waitUntil: 'networkidle2' });
        await page.waitForSelector('#stats_squads_defense_for', { timeout: 15000 });
        
        const defData = await page.evaluate(() => {
            const results = [];
            document.querySelectorAll('#stats_squads_defense_for tbody tr').forEach((row) => {
                const teamCell = row.querySelector('th[data-stat="team"], td[data-stat="team"]');
                const blksCell = row.querySelector('td[data-stat="blocks_shots"]'); 
                const intCell = row.querySelector('td[data-stat="interceptions"]'); 

                if (teamCell && teamCell.textContent && teamCell.textContent !== 'Total') {
                    results.push({
                        team: teamCell.textContent.trim().replace(/^vs\s+/, ''),
                        blocks_shots: parseInt(blksCell ? blksCell.textContent : '0') || 0,
                        interceptions: parseInt(intCell ? intCell.textContent : '0') || 0
                    });
                }
            });
            return results;
        });
        console.log(`Encontrou ${defData.length} times em Defesa.`);

        // 2.1 POSSE DE BOLA (%) - Voltando para a página de posse
        console.log("Buscando Posse de Bola % (Retornando para página de Posse)...");
        await page.goto('https://fbref.com/pt/comps/24/possession/Estatisticas-Serie-A', { waitUntil: 'networkidle2' });
        await page.waitForSelector('#stats_squads_possession_for', { timeout: 15000 });

        const possPctData = await page.evaluate(() => {
            const results = [];
            document.querySelectorAll('#stats_squads_possession_for tbody tr').forEach((row) => {
                const teamCell = row.querySelector('th[data-stat="team"], td[data-stat="team"]');
                const possCell = row.querySelector('td[data-stat="possession"]');

                if (teamCell && teamCell.textContent && teamCell.textContent !== 'Total') {
                    results.push({
                        team: teamCell.textContent.trim().replace(/^vs\s+/, ''),
                        posse_bola_pct: parseFloat(possCell ? possCell.textContent : '50.0') || 50.0
                    });
                }
            });
            return results;
        });
        console.log(`Encontrou ${possPctData.length} times em Posse de Bola %.`);


        // 3. SHOOTING (Gols e Chutes no Alvo)
        console.log("Buscando Finalizações (Gols e Chutes no Alvo)...");
        await page.goto('https://fbref.com/pt/comps/24/shooting/Estatisticas-Serie-A', { waitUntil: 'networkidle2' });
        await page.waitForSelector('#stats_squads_shooting_for', { timeout: 15000 });
        
        const shootData = await page.evaluate(() => {
            const results = [];
            document.querySelectorAll('#stats_squads_shooting_for tbody tr').forEach((row) => {
                const teamCell = row.querySelector('th[data-stat="team"], td[data-stat="team"]');
                const goalsCell = row.querySelector('td[data-stat="goals"]'); 
                const sotCell = row.querySelector('td[data-stat="shots_on_target"]'); 

                if (teamCell && teamCell.textContent && teamCell.textContent !== 'Total') {
                    results.push({
                        team: teamCell.textContent.trim().replace(/^vs\s+/, ''),
                        goals: parseInt(goalsCell ? goalsCell.textContent : '0') || 0,
                        shots_on_target: parseInt(sotCell ? sotCell.textContent : '0') || 0
                    });
                }
            });
            return results;
        });
        console.log(`Encontrou ${shootData.length} times em Finalizações.`);

        // 4. MISC (Faltas e Cartões)
        console.log("Buscando Atributos Diversos (Faltas)...");
        await page.goto('https://fbref.com/pt/comps/24/misc/Estatisticas-Serie-A', { waitUntil: 'networkidle2' });
        await page.waitForSelector('#stats_squads_misc_for', { timeout: 15000 });
        
        const miscData = await page.evaluate(() => {
            const results = [];
            document.querySelectorAll('#stats_squads_misc_for tbody tr').forEach((row) => {
                const teamCell = row.querySelector('th[data-stat="team"], td[data-stat="team"]');
                const flsCell = row.querySelector('td[data-stat="fouls"]'); // Faltas Cometidas

                if (teamCell && teamCell.textContent && teamCell.textContent !== 'Total') {
                    results.push({
                        team: teamCell.textContent.trim().replace(/^vs\s+/, ''),
                        faltas_cometidas: parseInt(flsCell ? flsCell.textContent : '0') || 0
                    });
                }
            });
            return results;
        });
        console.log(`Encontrou ${miscData.length} times em Atributos Diversos.`);

        // 4b. DESARMES SOFRIDOS — TklW da tabela adversária (misc_against)
        const miscOppData = await page.evaluate(() => {
            const results = [];
            document.querySelectorAll('#stats_squads_misc_against tbody tr').forEach((row) => {
                const teamCell = row.querySelector('th[data-stat="team"], td[data-stat="team"]');
                const tklWCell = row.querySelector('td[data-stat="tackles_won"]');

                if (teamCell && teamCell.textContent && teamCell.textContent !== 'Total') {
                    results.push({
                        team: teamCell.textContent.trim().replace(/^vs\s+/, ''),
                        tackles_won: parseInt(tklWCell ? tklWCell.textContent : '0') || 0
                    });
                }
            });
            return results;
        });
        console.log(`Encontrou ${miscOppData.length} times em Desarmes Sofridos (misc_against).`);

        // 5. TABELA DO BRASILEIRÃO (Geral + xGA)
        console.log("Buscando Tabela de Classificação...");
        await page.goto('https://fbref.com/pt/comps/24/Estatisticas-Serie-A', { waitUntil: 'networkidle2' });
        await page.waitForSelector('.stats_table', { timeout: 15000 });
        
        const tableData = await page.evaluate(() => {
            const results = [];
            document.querySelectorAll('#results2026241_overall tbody tr').forEach((row) => {
                // If it doesn't match 2026 exactly, try the generic one:
                const teamCell = row.querySelector('td[data-stat="team"]');
                const posCell = row.querySelector('th[data-stat="rank"]');
                const ptsCell = row.querySelector('td[data-stat="points"]');
                const wCell = row.querySelector('td[data-stat="wins"]');
                const dCell = row.querySelector('td[data-stat="ties"]');
                const lCell = row.querySelector('td[data-stat="losses"]');
                const gfCell = row.querySelector('td[data-stat="goals_for"]');
                const gaCell = row.querySelector('td[data-stat="goals_against"]');

                if (teamCell && teamCell.textContent) {
                    results.push({
                        team: teamCell.textContent.trim().replace(/^vs\s+/, ''),
                        posicao: parseInt(posCell ? posCell.textContent : '0') || 0,
                        pts: parseInt(ptsCell ? ptsCell.textContent : '0') || 0,
                        vitorias: parseInt(wCell ? wCell.textContent : '0') || 0,
                        empates: parseInt(dCell ? dCell.textContent : '0') || 0,
                        derrotas: parseInt(lCell ? lCell.textContent : '0') || 0,
                        gols_pro: parseInt(gfCell ? gfCell.textContent : '0') || 0,
                        gols_contra: parseInt(gaCell ? gaCell.textContent : '0') || 0
                    });
                }
            });
            return results;
        });
        
        // Se "#resultsXYZ_overall" mudar de ano p/ ano e retornar 0 times, vamos recorrer a um seletor genérico do tbody de table.stats_table
        let finalTableData = tableData;
        if (finalTableData.length === 0) {
            finalTableData = await page.evaluate(() => {
                const results = [];
                // Pega a primeira que seja a tabela base
                const tables = Array.from(document.querySelectorAll('table.stats_table'));
                if(tables.length > 0) {
                    tables[0].querySelectorAll('tbody tr').forEach((row) => {
                        const teamCell = row.querySelector('td[data-stat="team"]');
                        const posCell = row.querySelector('th[data-stat="rank"]');
                        const ptsCell = row.querySelector('td[data-stat="points"]');
                        const wCell = row.querySelector('td[data-stat="wins"]');
                        const dCell = row.querySelector('td[data-stat="ties"]');
                        const lCell = row.querySelector('td[data-stat="losses"]');
                        const gfCell = row.querySelector('td[data-stat="goals_for"]');
                        const gaCell = row.querySelector('td[data-stat="goals_against"]');
        
                        if (teamCell && teamCell.textContent && posCell) {
                            results.push({
                                team: teamCell.textContent.trim().replace(/^vs\s+/, ''),
                                posicao: parseInt(posCell ? posCell.textContent : '0') || 0,
                                pts: parseInt(ptsCell ? ptsCell.textContent : '0') || 0,
                                vitorias: parseInt(wCell ? wCell.textContent : '0') || 0,
                                empates: parseInt(dCell ? dCell.textContent : '0') || 0,
                                derrotas: parseInt(lCell ? lCell.textContent : '0') || 0,
                                gols_pro: parseInt(gfCell ? gfCell.textContent : '0') || 0,
                                gols_contra: parseInt(gaCell ? gaCell.textContent : '0') || 0
                            });
                        }
                    });
                }
                return results;
            });
        }
        console.log(`Encontrou ${finalTableData.length} times na Tabela de Classificação.`);

        // Consolidar
        const leagueTable = [];
        
        // 1. Posse de Bola (Perdas)
        possData.forEach((row) => {
            if (row.error) return;
            const abbr = TEAM_MAP[row.team] || row.team;
            fbrefDatabase[abbr] = {
                nome_fbref: row.team,
                posse: {
                    desarmes_sofridos: row.tackled,
                    perdas_posse: row.dispossessed + row.miscontrols
                }
            };
        });

        // 2. Defesa (Interceptacoes e Bloqueios)
        defData.forEach((row) => {
            const abbr = TEAM_MAP[row.team] || row.team;
            if (fbrefDatabase[abbr]) {
                fbrefDatabase[abbr].defesa = {
                    chutes_bloqueados: row.blocks_shots,
                    interceptacoes: row.interceptions
                };
            }
        });

        // 3. Posse de Bola (%)
        possPctData.forEach((row) => {
            const abbr = TEAM_MAP[row.team] || row.team;
            if (fbrefDatabase[abbr]) {
                if (!fbrefDatabase[abbr].posse) fbrefDatabase[abbr].posse = {};
                fbrefDatabase[abbr].posse.posse_bola_pct = row.posse_bola_pct;
            }
        });

        // 4. Ataque (Gols e Chutes no Alvo)
        shootData.forEach((row) => {
            const abbr = TEAM_MAP[row.team] || row.team;
            if (fbrefDatabase[abbr]) {
                fbrefDatabase[abbr].ataque = {
                    gols_feitos: row.goals,
                    finalizacoes_alvo: row.shots_on_target
                };
            }
        });

        // 5. Miscelânea (Faltas)
        miscData.forEach((row) => {
            const abbr = TEAM_MAP[row.team] || row.team;
            if (fbrefDatabase[abbr]) {
                if(!fbrefDatabase[abbr].indisciplina) fbrefDatabase[abbr].indisciplina = {};
                fbrefDatabase[abbr].indisciplina.faltas_cometidas = row.faltas_cometidas;
            }
        });

        // 5b. Desarmes Sofridos (TklW do adversário)
        miscOppData.forEach((row) => {
            const abbr = TEAM_MAP[row.team] || row.team;
            if (fbrefDatabase[abbr]) {
                if(!fbrefDatabase[abbr].posse) fbrefDatabase[abbr].posse = {};
                fbrefDatabase[abbr].posse.desarmes_sofridos = row.tackles_won;
            }
        });

        // 6. Alimentar Gols Sofridos na defesa e montar tabela da liga
        finalTableData.forEach((row) => {
            const abbr = TEAM_MAP[row.team] || row.team;
            if (fbrefDatabase[abbr]) {
                if(!fbrefDatabase[abbr].defesa) fbrefDatabase[abbr].defesa = {};
                fbrefDatabase[abbr].defesa.gols_sofridos = row.gols_contra;
            }
            leagueTable.push({
                clube: abbr,
                nome: row.team,
                posicao: row.posicao,
                pts: row.pts,
                vitorias: row.vitorias,
                empates: row.empates,
                derrotas: row.derrotas,
                gols_pro: row.gols_pro,
                gols_contra: row.gols_contra
            });
        });

        // Salvar tudo
        const outDir = path.join(process.cwd(), 'src', 'data');
        if (!fs.existsSync(outDir)) {
            fs.mkdirSync(outDir, { recursive: true });
        }
        
        const outPathFb = path.join(outDir, 'fbref_data.json');
        fs.writeFileSync(outPathFb, JSON.stringify(fbrefDatabase, null, 2));

        const outPathTable = path.join(outDir, 'league_table.json');
        fs.writeFileSync(outPathTable, JSON.stringify(leagueTable, null, 2));
        
        console.log(`\nSucesso! Tabelas (FBref Stats e Classificação) salvas. Total de clubes: ${Object.keys(fbrefDatabase).length}.`);

    } catch (error) {
        console.error("Erro ao capturar dados do FBref:", error);
    } finally {
        await browser.close();
    }
}

scrapeFBref();
