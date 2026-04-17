javascript:(function(){
    const GROQ_API_KEY = "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";
    const GROQ_MODEL = "llama3-70b-8192";
    let processando = false;

    function log(msg) { console.log("✅ [AutoQuiz]:", msg); }

    async function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

    function extrairPergunta() {
        let pergunta = "";
        let perguntaEl = document.querySelector('[data-test-id="problem-text"], .problem-text, [class*="TaskStepper"] p, .question-text, .q-definition');
        if(perguntaEl) pergunta = perguntaEl.innerText.trim();
        if(!pergunta) {
            let container = document.querySelector('[data-test-id="task"], .task-container');
            if(container) {
                let clone = container.cloneNode(true);
                clone.querySelectorAll('button, input, .answer-area').forEach(el => el.remove());
                pergunta = clone.innerText.trim().slice(0, 800);
            }
        }
        return pergunta;
    }

    function extrairAlternativas() {
        let alternativas = [];
        let elementos = document.querySelectorAll('[data-test-id="answer-choice"], [role="radio"], [role="checkbox"], .choice, .answer-choice');
        if(!elementos.length) {
            elementos = document.querySelectorAll('label:has(input[type="radio"]), .option, .answer');
        }
        for(let el of elementos) {
            let texto = el.innerText.trim();
            if(texto && texto.length > 0 && texto.length < 300) alternativas.push(texto);
        }
        if(!alternativas.length) {
            let radios = document.querySelectorAll('input[type="radio"]');
            for(let radio of radios) {
                let label = document.querySelector(`label[for="${radio.id}"]`);
                if(label) alternativas.push(label.innerText.trim());
            }
        }
        return { alternativas, elementosAlternativas: elementos.length ? elementos : radios };
    }

    async function perguntarGroq(pergunta, alternativas) {
        let prompt = `Responda APENAS com a letra da alternativa correta (A, B, C, D...).\nPergunta: ${pergunta}\nAlternativas:\n${alternativas.map((a,i)=>`${String.fromCharCode(65+i)}. ${a}`).join('\n')}\nAlternativa correta:`;
        let resposta = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model: GROQ_MODEL, messages: [{ role: "user", content: prompt }], temperature: 0, max_tokens: 10 })
        });
        let dados = await resposta.json();
        let conteudo = dados.choices[0].message.content.trim();
        let match = conteudo.match(/[A-D]/i);
        if(match) return alternativas[match[0].toUpperCase().charCodeAt(0)-65];
        return conteudo;
    }

    async function executar() {
        if(processando) return;
        processando = true;
        log("Procurando pergunta...");
        let pergunta = extrairPergunta();
        if(!pergunta) { log("Nenhuma pergunta encontrada"); processando=false; return; }
        let { alternativas, elementosAlternativas } = extrairAlternativas();
        if(alternativas.length === 0) { log("Nenhuma alternativa encontrada"); processando=false; return; }
        log(`Pergunta: ${pergunta.substring(0,80)}...`);
        log(`Alternativas: ${alternativas.join(" | ")}`);
        try {
            let correta = await perguntarGroq(pergunta, alternativas);
            log(`IA respondeu: ${correta}`);
            for(let i=0; i<elementosAlternativas.length; i++) {
                let textoAlt = elementosAlternativas[i].innerText.trim();
                if(textoAlt === correta || textoAlt.includes(correta) || correta.includes(textoAlt)) {
                    let alvo = elementosAlternativas[i].tagName === 'INPUT' ? elementosAlternativas[i] : (elementosAlternativas[i].querySelector('input') || elementosAlternativas[i]);
                    alvo.click();
                    log(`Clicou em: ${textoAlt}`);
                    await delay(600);
                    let submit = document.querySelector('[data-test-id="check-answer"], button[type="submit"], .check-button');
                    if(submit) { submit.click(); log("Submeteu resposta"); }
                    break;
                }
            }
        } catch(e) { log("Erro: "+e.message); }
        processando = false;
    }
    executar();
})();
