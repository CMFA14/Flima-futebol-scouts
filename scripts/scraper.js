import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

console.log("🚀 Iniciando Motor de Extração Avançada Flima Scouts (FBref)...");

const TEAM_MAP = {
    "Flamengo": "FLA",
    "Palmeiras": "PAL",
    "Atlético Mineiro": "CAM",
    "Botafogo (RJ)": "BOT",
    "Botafogo": "BOT",
    "São Paulo": "SAO",
    "Fluminense": "FLU",
    "Grêmio": "GRE",
    "Internacional": "INT",
    "Athletico Paranaense": "CAP",
    "Athletico": "CAP",
    "Athletico-PR": "CAP",
    "Fortaleza": "FOR",
    "Corinthians": "COR",
    "Cruzeiro": "CRU",
    "Vasco da Gama": "VAS",
    "Vasco": "VAS",
    "Bahia": "BAH",
    "Vitória": "VIT",
    "Juventude": "JUV",
    "Criciúma": "CRI",
    "Atlético Goianiense": "ACG",
    "Cuiabá": "CUI",
    "Red Bull Bragantino": "RBB",
    "Bragantino": "RBB",
    "RB Bragantino": "RBB"
};

const BASE_URL = 'https://fbref.com/en/comps/24';

const SCRAPE_CONFIG = {
    overview: {
        url: `${BASE_URL}/Serie-A-Stats`,
        tables: [
            { id: 'results2026241_overall', key: 'overall' },
            { id: 'results2026241_home_away', key: 'home_away' }
        ]
    },
    standard: {
        url: `${BASE_URL}/stats/Serie-A-Stats`,
        tables: [
            { id: 'stats_squads_standard_for', key: 'standard_for' },
            { id: 'stats_squads_standard_against', key: 'standard_against' }
        ]
    },
    keepers: {
        url: `${BASE_URL}/keepers/Serie-A-Stats`,
        tables: [
            { id: 'stats_squads_keeper_for', key: 'keepers_for' },
            { id: 'stats_squads_keeper_against', key: 'keepers_against' }
        ]
    },
    shooting: {
        url: `${BASE_URL}/shooting/Serie-A-Stats`,
        tables: [
            { id: 'stats_squads_shooting_for', key: 'shooting_for' },
            { id: 'stats_squads_shooting_against', key: 'shooting_against' }
        ]
    },
    playing_time: {
        url: `${BASE_URL}/playingtime/Serie-A-Stats`,
        tables: [
            { id: 'stats_squads_playing_time_for', key: 'playing_time_for' },
            { id: 'stats_squads_playing_time_against', key: 'playing_time_against' }
        ]
    },
    misc: {
        url: `${BASE_URL}/misc/Serie-A-Stats`,
        tables: [
            { id: 'stats_squads_misc_for', key: 'misc_for' },
            { id: 'stats_squads_misc_against', key: 'misc_against' }
        ]
    },
    possession: {
        url: `${BASE_URL}/possession/Serie-A-Stats`,
        tables: [
            { id: 'stats_squads_possession_for', key: 'possession_for' },
            { id: 'stats_squads_possession_against', key: 'possession_against' },
            { id: 'stats_squads_poss_for', key: 'possession_for' },
            { id: 'stats_squads_poss_against', key: 'possession_against' }
        ]
    }
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function scrapeTable(page, tableId) {
    try {
        // Espera a tabela aparecer no DOM
        await page.waitForSelector(`#${tableId}`, { timeout: 15000 });
        
        // Scroll suave para garantir carregamento de dados lazy-loaded (importante para FBref)
        await page.evaluate(async (id) => {
            const table = document.querySelector(`#${id}`);
            if (table) {
                table.scrollIntoView({ behavior: 'smooth', block: 'center' });
                await new Promise(r => setTimeout(r, 4000));
            }
        }, tableId);
        
        return await page.evaluate((id) => {
            const results = [];
            const table = document.querySelector(`#${id}`);
            if (!table) return null;

            const rows = table.querySelectorAll('tbody tr');
            if (rows.length === 0) return null;

            rows.forEach(row => {
                if (row.classList.contains('spacer') || row.classList.contains('thead')) return;
                
                const rowData = {};
                const cells = row.querySelectorAll('th, td');
                
                cells.forEach(cell => {
                    const stat = cell.getAttribute('data-stat');
                    if (stat) {
                        const text = cell.textContent.trim();
                        if (text === "") {
                            rowData[stat] = 0;
                        } else {
                            // Converte para número se possível, senão mantém string
                            const cleanText = text.replace(/,/g, '').replace(/%/g, '');
                            const num = parseFloat(cleanText);
                            rowData[stat] = isNaN(num) ? text : num;
                        }
                    }
                });

                if (rowData.team || rowData.squad) {
                    // Normaliza 'squad' para 'team' se necessário
                    if (!rowData.team && rowData.squad) rowData.team = rowData.squad;
                    results.push(rowData);
                }
            });
            return results;
        }, tableId);
    } catch (e) {
        console.log(`   ⚠️ Timeout ou erro ao esperar pela tabela #${tableId}`);
        return null;
    }
}

async function startScraper() {
    const isCloud = process.env.GITHUB_ACTIONS === 'true';
    const browser = await puppeteer.launch({ 
        headless: isCloud ? true : false,
        defaultViewport: null,
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox', 
            '--disable-blink-features=AutomationControlled'
        ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    
    const fbrefDatabase = {};
    const leagueTable = [];

    try {
        for (const [category, config] of Object.entries(SCRAPE_CONFIG)) {
            console.log(`\n📂 Acessando Categoria: ${category.toUpperCase()}...`);
            
            let success = false;
            for (let i = 0; i < 2; i++) {
                try {
                    await page.goto(config.url, { waitUntil: 'networkidle2', timeout: 90000 });
                    success = true;
                    break;
                } catch (e) {
                    console.log(`⚠️ Falha na tentativa ${i+1}. Retentando...`);
                    await sleep(5000);
                }
            }

            if (!success) {
                console.error(`❌ Não foi possível carregar a página: ${config.url}`);
                continue;
            }

            await sleep(3000); // Respeitar o rate limit do FBref

            for (const tableConfig of config.tables) {
                console.log(`   🔍 Extraindo Tabela: ${tableConfig.id}...`);
                const data = await scrapeTable(page, tableConfig.id);
                
                if (data) {
                    console.log(`   ✅ Encontrados ${data.length} times.`);
                    
                    data.forEach(item => {
                        const originalName = item.team.replace(/^vs\s+/, '');
                        const abbr = TEAM_MAP[originalName] || originalName;
                        
                        if (!fbrefDatabase[abbr]) {
                            fbrefDatabase[abbr] = {
                                nome_fbref: originalName,
                                last_update: new Date().toISOString()
                            };
                        }

                        // Organiza hierarquicamente (ex: standard_for -> standard.for, playing_time_for -> playing_time.for)
                        const lastUnderscore = tableConfig.key.lastIndexOf('_');
                        const mainKey = tableConfig.key.substring(0, lastUnderscore);
                        const subKey = tableConfig.key.substring(lastUnderscore + 1);

                        if (subKey === 'for' || subKey === 'against') {
                             if (!fbrefDatabase[abbr][mainKey]) fbrefDatabase[abbr][mainKey] = {};
                             fbrefDatabase[abbr][mainKey][subKey] = item;
                        } else {
                             fbrefDatabase[abbr][tableConfig.key] = item;
                        }

                        // Extrai a tabela da liga se for a tabela geral
                        if (tableConfig.id === 'results2026241_overall') {
                            leagueTable.push({
                                clube: abbr,
                                nome: originalName,
                                posicao: item.rank,
                                pts: item.points,
                                vitorias: item.wins,
                                empates: item.ties,
                                derrotas: item.losses,
                                gols_pro: item.goals_for,
                                gols_contra: item.goals_against
                            });
                        }
                    });
                } else {
                    console.log(`   ⚠️ Tabela ${tableConfig.id} não encontrada ou vazia.`);
                }
            }
        }

        // --- SALVAMENTO ---
        const outDir = path.join(process.cwd(), 'src', 'data');
        if (!fs.existsSync(outDir)) {
            fs.mkdirSync(outDir, { recursive: true });
        }
        
        fs.writeFileSync(path.join(outDir, 'fbref_data.json'), JSON.stringify(fbrefDatabase, null, 2));
        fs.writeFileSync(path.join(outDir, 'league_table.json'), JSON.stringify(leagueTable, null, 2));
        
        console.log(`\n✨ SUCESSO! Base de dados Flima Intelligence atualizada.`);
        console.log(`📅 Clubes atualizados: ${Object.keys(fbrefDatabase).length}`);

    } catch (error) {
        console.error("💥 Erro crítico no Scraper:", error);
    } finally {
        await browser.close();
    }
}

startScraper();
