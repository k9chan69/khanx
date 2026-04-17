// ================= KHAN ACADEMY AUTO-ANSWER com GROQ API =================
// Modo de usar: 
// 1. Substitua SUA_CHAVE_AQUI pela sua API key do Groq
// 2. Copie o código abaixo
// 3. Abra o console do navegador (F12) na Khan Academy
// 4. Cole e execute
// =========================================================================

(function() {
    const CONFIG = {
        groqApiKey: "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",  // <--- COLOQUE SUA CHAVE AQUI
        groqModel: "llama3-70b-8192",   // ou "mixtral-8x7b-32768", "gemma2-9b-it"
        autoSubmit: true,               // submeter automaticamente após responder
        debug: true,                    // logs no console
        delayBetween: 800               // ms entre ações
    };

    let isProcessing = false;
    let lastQuestionHash = "";

    function log(msg, type = "info") {
        if(!CONFIG.debug) return;
        const icons = { info: "📘", success: "✅", error: "❌", warning: "⚠️", ai: "🤖" };
        console.log(`${icons[type] || "📘"} [KhanAuto] ${msg}`);
    }

    function delay(ms) {
        return new Promise(r => setTimeout(r, ms));
    }

    function hashString(str) {
        let hash = 0;
        for(let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        return hash;
    }

    // Detecta o tipo de plataforma (Khan Academy ou similar)
    function detectPlatform() {
        if(window.location.href.includes("khanacademy.org")) return "khan";
        if(window.location.href.includes("wayground")) return "wayground";
        if(window.location.href.includes("inglesparana")) return "inglesparana";
        return "generic";
    }

    // Seletores específicos por plataforma
    function getSelectors(platform) {
        const selectors = {
            khan: {
                question: '[data-test-id="problem-text"], .problem-text, [class*="TaskStepper"], .question-text',
                alternatives: '[data-test-id="answer-choice"], [role="radio"], [role="checkbox"], .choice, .answer-choice',
                submit: '[data-test-id="check-answer"], button[data-test-id="check-answer"], .check-button'
            },
            wayground: {
                question: '.question, .quiz-question, [data-quiz-question]',
                alternatives: 'input[type="radio"] + label, .option, .answer-choice',
                submit: 'button[type="submit"], .submit-btn, .next-btn'
            },
            inglesparana: {
                question: '.exercise-question, .question-text, [class*="question"]',
                alternatives: '.option, .choice, input[type="radio"] + span',
                submit: '.next-button, .submit-answer, button[type="submit"]'
            },
            generic: {
                question: '.question, .problem, [class*="question"], [class*="quiz"]',
                alternatives: 'input[type="radio"], input[type="checkbox"], .option, .choice',
                submit: 'button[type="submit"], .submit, .check, .next'
            }
        };
        return selectors[platform] || selectors.generic;
    }

    async function extractQuestionAndAlternatives(platform, selectors) {
        // Tenta encontrar a pergunta
        let questionEl = document.querySelector(selectors.question);
        let questionText = "";
        
        if(questionEl) {
            questionText = questionEl.innerText.trim();
        } else {
            // Fallback: pegar texto principal da área de conteúdo
            let contentArea = document.querySelector('[data-test-id="task"], .task-container, .exercise-content, main, .content');
            if(contentArea) {
                let clone = contentArea.cloneNode(true);
                // Remove elementos de botões/interação
                clone.querySelectorAll('button, input, [role="button"]').forEach(el => el.remove());
                questionText = clone.innerText.trim().slice(0, 1500);
            }
        }
        
        if(!questionText) {
            log("Não foi possível extrair a pergunta", "warning");
            return null;
        }
        
        // Extrai alternativas
        let altElements = document.querySelectorAll(selectors.alternatives);
        let alternatives = [];
        
        for(let el of altElements) {
            let text = el.innerText.trim();
            // Se for input, pega o label associado ou texto do parent
            if(el.tagName === 'INPUT') {
                let label = document.querySelector(`label[for="${el.id}"]`);
                if(label) text = label.innerText.trim();
                if(!text && el.parentElement) text = el.parentElement.innerText.trim();
            }
            if(text && text.length > 0 && text.length < 500) {
                alternatives.push(text);
            }
        }
        
        // Remove duplicatas
        alternatives = [...new Set(alternatives)];
        
        return { questionText, alternatives, altElements };
    }

    async function askGroq(question, alternatives) {
        const altText = alternatives.map((a, i) => `${String.fromCharCode(65+i)}. ${a}`).join('\n');
        
        const prompt = `Você é um tutor especializado. Responda APENAS com a letra da alternativa correta (ex: "B") ou, se não houver letra, com o texto exato da alternativa.

Pergunta: ${question}

Alternativas:
${altText}

Qual é a alternativa correta? Responda APENAS com a letra ou o texto exato.`;

        log("Enviando para Groq...", "ai");
        
        try {
            const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${CONFIG.groqApiKey}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: CONFIG.groqModel,
                    messages: [{ role: "user", content: prompt }],
                    temperature: 0.1,
                    max_tokens: 50
                })
            });
            
            if(!response.ok) {
                const error = await response.text();
                throw new Error(`API error ${response.status}: ${error}`);
            }
            
            const data = await response.json();
            let answer = data.choices[0].message.content.trim();
            
            // Extrai letra (A, B, C, D...)
            const letterMatch = answer.match(/^([A-Z])/i);
            if(letterMatch) {
                const idx = letterMatch[1].toUpperCase().charCodeAt(0) - 65;
                if(alternatives[idx]) {
                    answer = alternatives[idx];
                }
            }
            
            log(`Resposta da IA: "${answer}"`, "ai");
            return answer;
            
        } catch(error) {
            log(`Erro na API: ${error.message}`, "error");
            return null;
        }
    }

    async function clickAnswer(answerText, altElements, alternatives) {
        for(let i = 0; i < altElements.length; i++) {
            const el = altElements[i];
            let elText = el.innerText.trim();
            
            // Se for input, tenta pegar texto do label
            if(el.tagName === 'INPUT') {
                const label = document.querySelector(`label[for="${el.id}"]`);
                if(label) elText = label.innerText.trim();
                if(!elText && el.parentElement) elText = el.parentElement.innerText.trim();
            }
            
            // Comparação flexível
            if(elText && (
                elText.toLowerCase() === answerText.toLowerCase() ||
                elText.toLowerCase().includes(answerText.toLowerCase()) ||
                answerText.toLowerCase().includes(elText.toLowerCase())
            )) {
                // Clica no elemento ou no input dentro dele
                const target = el.tagName === 'INPUT' ? el : (el.querySelector('input') || el);
                target.click();
                log(`Clicou na alternativa: "${elText}"`, "success");
                return true;
            }
        }
        
        log(`Não encontrou alternativa exata para: "${answerText}"`, "warning");
        return false;
    }

    async function submitAnswer(selectors) {
        if(!CONFIG.autoSubmit) return false;
        
        const submitBtn = document.querySelector(selectors.submit);
        if(submitBtn) {
            await delay(CONFIG.delayBetween);
            submitBtn.click();
            log("Submeteu resposta", "success");
            return true;
        }
        return false;
    }

    async function processCurrentQuestion() {
        if(isProcessing) {
            log("Já processando... ignorando", "warning");
            return;
        }
        
        const platform = detectPlatform();
        const selectors = getSelectors(platform);
        
        log(`Plataforma detectada: ${platform}`, "info");
        
        const data = await extractQuestionAndAlternatives(platform, selectors);
        if(!data || !data.questionText || data.alternatives.length === 0) {
            log("Não foi possível extrair pergunta/alternativas", "warning");
            return;
        }
        
        // Evita reprocessar a mesma pergunta
        const questionHash = hashString(data.questionText);
        if(questionHash === lastQuestionHash) {
            log("Mesma pergunta, ignorando", "info");
            return;
        }
        lastQuestionHash = questionHash;
        
        log(`Pergunta: ${data.questionText.slice(0, 100)}...`, "info");
        log(`Alternativas (${data.alternatives.length}): ${data.alternatives.join(" | ")}`, "info");
        
        isProcessing = true;
        
        try {
            const correctAnswer = await askGroq(data.questionText, data.alternatives);
            if(correctAnswer) {
                const clicked = await clickAnswer(correctAnswer, data.altElements, data.alternatives);
                if(clicked) {
                    await delay(CONFIG.delayBetween);
                    await submitAnswer(selectors);
                }
            }
        } finally {
            isProcessing = false;
        }
    }

    // Inicia o monitoramento
    function start() {
        if(CONFIG.groqApiKey === "SUA_CHAVE_AQUI") {
            log("⚠️ ATENÇÃO: Configure sua chave da API Groq no CONFIG.groqApiKey", "error");
            log("Obtenha uma chave grátis em: console.groq.com", "info");
            return;
        }
        
        log(`Iniciando auto-answer (modelo: ${CONFIG.groqModel})`, "success");
        
        // Processa imediatamente
        processCurrentQuestion();
        
        // Observa mudanças no DOM para novas perguntas
        const observer = new MutationObserver(() => {
            // Verifica se há uma nova pergunta na tela
            const platform = detectPlatform();
            const selectors = getSelectors(platform);
            const questionEl = document.querySelector(selectors.question);
            if(questionEl && !isProcessing) {
                delay(1000).then(() => processCurrentQuestion());
            }
        });
        
        observer.observe(document.body, { childList: true, subtree: true });
        
        log("Monitoramento ativo. Aguardando perguntas...", "success");
    }
    
    start();
})();
