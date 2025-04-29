document.addEventListener('DOMContentLoaded', function() {
    // Verifica LocalStorage
    if (!testarLocalStorage()) {
        mostrarAlerta('Seu navegador não suporta armazenamento local necessário para agendamentos.', 'danger');
        return;
    }

    // Elementos do DOM
    const formAgendamento = document.getElementById('agendamentoForm');
    const inputNome = document.getElementById('nome');
    const inputTelefone = document.getElementById('telefone');
    const inputData = document.getElementById('data');
    const selectHora = document.getElementById('hora');
    const inputProfissional = document.getElementById('profissionalSelecionado');
    const checkboxesServicos = document.querySelectorAll('input[name="servicos[]"]');

    // Modais
    const modalConfirmacao = new bootstrap.Modal('#confirmacaoModal');
    const modalCancelamento = new bootstrap.Modal('#cancelamentoModal');
    const textoConfirmacao = document.getElementById('confirmacaoTexto');
    const linkWhatsapp = document.getElementById('whatsappLink');
    const textoCancelamento = document.getElementById('cancelamentoTexto');
    const btnCancelarAgendamento = document.getElementById('cancelarAgendamentoBtn');
    const btnConfirmarCancelamento = document.getElementById('confirmarCancelamentoBtn');

    // Variáveis de estado
    let ultimoAgendamentoId = null;
    let agendamentos = JSON.parse(localStorage.getItem('agendamentos')) || [];
    const DURACAO_PADRAO_MINUTOS = 180; // 3 horas

    // Configuração inicial
    configurarDataMinima();
    desabilitarHorario();

    // Event Listeners
    formAgendamento.addEventListener('submit', submeterFormulario);
    inputData.addEventListener('change', atualizarHorariosDisponiveis);
    checkboxesServicos.forEach(cb => cb.addEventListener('change', handleSelecaoProfissional));
    btnCancelarAgendamento.addEventListener('click', prepararCancelamento);
    btnConfirmarCancelamento.addEventListener('click', confirmarCancelamento);

    // Funções principais
    function testarLocalStorage() {
        try {
            const teste = 'testeLocalStorage';
            localStorage.setItem(teste, teste);
            localStorage.removeItem(teste);
            return true;
        } catch (e) {
            console.error('Erro no localStorage:', e);
            return false;
        }
    }

    function configurarDataMinima() {
        const hoje = new Date();
        const dia = String(hoje.getDate()).padStart(2, '0');
        const mes = String(hoje.getMonth() + 1).padStart(2, '0');
        const ano = hoje.getFullYear();
        inputData.min = `${ano}-${mes}-${dia}`;
    }

    function desabilitarHorario() {
        selectHora.innerHTML = '<option value="" selected disabled>Selecione primeiro a data e o profissional</option>';
        selectHora.disabled = true;
    }

    function handleSelecaoProfissional(event) {
        const checkbox = event.target;
        
        if (checkbox.checked) {
            checkboxesServicos.forEach(cb => {
                if (cb !== checkbox) cb.checked = false;
            });
            
            inputProfissional.value = checkbox.value;
            
            if (inputData.value) {
                atualizarHorariosDisponiveis();
            }
        } else {
            inputProfissional.value = '';
            desabilitarHorario();
        }
    }

    function formatarTelefone(numero) {
        const numeros = numero.replace(/\D/g, '');
        if (numeros.length <= 2) return `(${numeros}`;
        if (numeros.length <= 6) return `(${numeros.substring(0, 2)}) ${numeros.substring(2)}`;
        if (numeros.length <= 10) return `(${numeros.substring(0, 2)}) ${numeros.substring(2, 6)}-${numeros.substring(6)}`;
        return `(${numeros.substring(0, 2)}) ${numeros.substring(2, 7)}-${numeros.substring(7, 11)}`;
    }

    function validarTelefone(numero) {
        const numeros = numero.replace(/\D/g, '');
        return numeros.length >= 10 && numeros.length <= 11;
    }

    function atualizarHorariosDisponiveis() {
        if (!inputProfissional.value) {
            desabilitarHorario();
            return;
        }

        const dataSelecionada = new Date(inputData.value + 'T00:00:00');
        const diaSemana = dataSelecionada.getDay();
        const hoje = new Date();
        
        if (diaSemana === 0 || diaSemana === 1) {
            selectHora.innerHTML = '<option value="" disabled>Fechado aos domingos e segundas</option>';
            selectHora.disabled = true;
            return;
        }

        selectHora.innerHTML = '<option value="" disabled selected>Carregando horários...</option>';
        selectHora.disabled = false;

        try {
            const agendamentosDia = agendamentos.filter(ag => {
                const agDate = new Date(ag.inicio);
                return agDate.toDateString() === dataSelecionada.toDateString() && 
                       ag.profissional === inputProfissional.value;
            });

            const horariosDisponiveis = [];
            const HORA_INICIO = 8;
            const HORA_FIM = 19;

            for (let hora = HORA_INICIO; hora < HORA_FIM; hora++) {
                const horario = new Date(dataSelecionada);
                horario.setHours(hora, 0, 0, 0);
                
                const horaFormatada = `${String(hora).padStart(2, '0')}:00`;
                
                if (dataSelecionada.toDateString() === hoje.toDateString() && horario <= hoje) {
                    horariosDisponiveis.push(`<option value="${horaFormatada}" disabled>${horaFormatada} (passado)</option>`);
                    continue;
                }
                
                const horarioDisponivel = verificarDisponibilidadeHorario(
                    horario, 
                    DURACAO_PADRAO_MINUTOS, 
                    agendamentosDia
                );
                
                if (horarioDisponivel) {
                    horariosDisponiveis.push(`<option value="${horaFormatada}">${horaFormatada}</option>`);
                } else {
                    horariosDisponiveis.push(`<option value="${horaFormatada}" disabled>${horaFormatada} (indisponível)</option>`);
                }
            }

            selectHora.innerHTML = horariosDisponiveis.length > 0 
                ? '<option value="" disabled selected>Selecione um horário</option>' + horariosDisponiveis.join('')
                : '<option value="" disabled>Nenhum horário disponível</option>';
        } catch (error) {
            console.error('Erro ao carregar horários:', error);
            selectHora.innerHTML = '<option value="" disabled>Erro ao carregar horários</option>';
        }
    }

    function verificarDisponibilidadeHorario(horarioInicio, duracaoMinutos, agendamentosDia) {
        const horarioFim = new Date(horarioInicio.getTime() + duracaoMinutos * 60000);
        
        for (const agendamento of agendamentosDia) {
            const inicioExistente = new Date(agendamento.inicio);
            const fimExistente = new Date(agendamento.fim);
            
            if (
                (horarioInicio >= inicioExistente && horarioInicio < fimExistente) ||
                (horarioFim > inicioExistente && horarioFim <= fimExistente) ||
                (horarioInicio <= inicioExistente && horarioFim >= fimExistente)
            ) {
                return false;
            }
        }
        
        return true;
    }

    function submeterFormulario(event) {
        event.preventDefault();
        
        if (!validarFormulario()) return;
        
        const agendamento = criarObjetoAgendamento();
        
        // Verifica conflitos ANTES de salvar
        if (verificarConflitoAgendamento(agendamento)) {
            mostrarAlerta('Este horário já está reservado para o serviço/profissional selecionado. Escolha outro horário.', 'warning');
            return;
        }
        
        if (!salvarAgendamento(agendamento)) {
            mostrarAlerta('Erro ao salvar agendamento. Tente novamente.', 'danger');
            return;
        }
        
        enviarNotificacoes(agendamento);
        exibirConfirmacao(agendamento);
    }

    function verificarConflitoAgendamento(novoAgendamento) {
        return agendamentos.some(ag => {
            const mesmoServico = ag.servicos === novoAgendamento.servicos;
            const mesmoProfissional = ag.profissional === novoAgendamento.profissional;
            const mesmoHorario = (
                new Date(ag.inicio).toISOString() === novoAgendamento.inicio ||
                new Date(ag.fim).toISOString() === novoAgendamento.fim
            );
            
            return mesmoServico && mesmoProfissional && mesmoHorario;
        });
    }

    function validarFormulario() {
        if (inputNome.value.trim().length < 3) {
            mostrarAlerta('Por favor, insira seu nome completo', 'warning');
            inputNome.focus();
            return false;
        }
        
        if (!validarTelefone(inputTelefone.value)) {
            mostrarAlerta('Por favor, insira um telefone válido com DDD', 'warning');
            inputTelefone.focus();
            return false;
        }
        
        if (!inputProfissional.value) {
            mostrarAlerta('Selecione um profissional', 'warning');
            return false;
        }
        
        if (!inputData.value || !selectHora.value) {
            mostrarAlerta('Selecione uma data e horário válidos', 'warning');
            return false;
        }
        
        return true;
    }

    function criarObjetoAgendamento() {
        const [ano, mes, dia] = inputData.value.split('-');
        const [hora, minuto] = selectHora.value.split(':');
        
        const inicio = new Date(Date.UTC(ano, mes - 1, dia, hora, minuto));
        const fim = new Date(inicio.getTime() + DURACAO_PADRAO_MINUTOS * 60000);
        
        const servicos = Array.from(document.querySelectorAll('input[name="servicos[]"]:checked'))
                            .map(cb => cb.value);
        
        return {
            id: 'ag-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6),
            nome: inputNome.value.trim(),
            telefone: inputTelefone.value,
            profissional: inputProfissional.value,
            servicos: servicos.join(', '),
            inicio: inicio.toISOString(),
            fim: fim.toISOString(),
            dataCriacao: new Date().toISOString()
        };
    }

    function salvarAgendamento(agendamento) {
        try {
            agendamentos.push(agendamento);
            localStorage.setItem('agendamentos', JSON.stringify(agendamentos));
            ultimoAgendamentoId = agendamento.id;
            return true;
        } catch (e) {
            console.error('Erro ao salvar agendamento:', e);
            return false;
        }
    }

    function enviarNotificacoes(agendamento) {
        const dataFormatada = new Date(agendamento.inicio).toLocaleDateString('pt-BR');
        const horaFormatada = new Date(agendamento.inicio).toLocaleTimeString('pt-BR', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
        
        const msgCliente = `✅ *Agendamento Confirmado - Shalom Adonai* ✅\n\n` +
                          `Olá ${agendamento.nome},\n\n` +
                          `Seu agendamento foi confirmado com sucesso!\n\n` +
                          `📅 *Data:* ${dataFormatada}\n` +
                          `⏰ *Horário:* ${horaFormatada}\n` +
                          `💇 *Profissional:* ${agendamento.profissional}\n` +
                          `💅 *Serviço(s):* ${agendamento.servicos}\n\n` +
                          `📍 *Local:* R. Nhatumani, 496 - Vila Ré\n\n` +
                          `ID do agendamento: ${agendamento.id}\n\n` +
                          `Para cancelar ou alterar, responda esta mensagem.`;
        
        const msgSalao = `📋 *NOVO AGENDAMENTO* 📋\n\n` +
                         `👤 *Cliente:* ${agendamento.nome}\n` +
                         `📞 *Telefone:* ${agendamento.telefone}\n` +
                         `📅 *Data:* ${dataFormatada}\n` +
                         `⏰ *Horário:* ${horaFormatada}\n` +
                         `👩‍⚕️ *Profissional:* ${agendamento.profissional}\n` +
                         `💅 *Serviço(s):* ${agendamento.servicos}\n\n` +
                         `ID: ${agendamento.id}`;
        
        enviarWhatsApp(agendamento.telefone, msgCliente);
        enviarWhatsApp('11967036990', msgSalao);
    }

    function enviarWhatsApp(numero, mensagem) {
        const numeroLimpo = numero.replace(/\D/g, '');
        const mensagemCodificada = encodeURIComponent(mensagem);
        const urlWhatsapp = `https://wa.me/55${numeroLimpo}?text=${mensagemCodificada}`;
        window.open(urlWhatsapp, '_blank');
    }

    function exibirConfirmacao(agendamento) {
        const dataFormatada = new Date(agendamento.inicio).toLocaleDateString('pt-BR');
        const horaFormatada = new Date(agendamento.inicio).toLocaleTimeString('pt-BR', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
        
        textoConfirmacao.innerHTML = `
            <p><strong>${agendamento.nome}</strong>, seu agendamento foi confirmado!</p>
            <div class="agendamento-detalhes p-3 bg-light rounded mt-3">
                <p class="mb-1"><strong>Serviço:</strong> ${agendamento.servicos}</p>
                <p class="mb-1"><strong>Profissional:</strong> ${agendamento.profissional}</p>
                <p class="mb-1"><strong>Data:</strong> ${dataFormatada}</p>
                <p class="mb-0"><strong>Horário:</strong> ${horaFormatada}</p>
                <p class="mt-2 mb-0 small"><strong>ID:</strong> ${agendamento.id}</p>
            </div>
        `;
        
        linkWhatsapp.href = `https://wa.me/55${agendamento.telefone.replace(/\D/g, '')}`;
        modalConfirmacao.show();
        
        modalConfirmacao._element.addEventListener('hidden.bs.modal', function() {
            formAgendamento.reset();
            desabilitarHorario();
            inputProfissional.value = '';
            checkboxesServicos.forEach(cb => cb.checked = false);
        }, { once: true });
    }

    function prepararCancelamento() {
        if (!ultimoAgendamentoId) return;
        
        const agendamento = agendamentos.find(ag => ag.id === ultimoAgendamentoId);
        if (!agendamento) return;
        
        const dataFormatada = new Date(agendamento.inicio).toLocaleDateString('pt-BR');
        const horaFormatada = new Date(agendamento.inicio).toLocaleTimeString('pt-BR', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
        
        textoCancelamento.innerHTML = `
            <p>Você está prestes a cancelar o seguinte agendamento:</p>
            <div class="agendamento-detalhes p-3 bg-light rounded mt-3">
                <p class="mb-1"><strong>Serviço:</strong> ${agendamento.servicos}</p>
                <p class="mb-1"><strong>Profissional:</strong> ${agendamento.profissional}</p>
                <p class="mb-1"><strong>Data:</strong> ${dataFormatada}</p>
                <p class="mb-0"><strong>Horário:</strong> ${horaFormatada}</p>
                <p class="mt-2 mb-0 small"><strong>ID:</strong> ${agendamento.id}</p>
            </div>
            <p class="mt-3">Tem certeza que deseja cancelar?</p>
        `;
        
        modalConfirmacao.hide();
        modalCancelamento.show();
    }

    function confirmarCancelamento() {
        if (!ultimoAgendamentoId) return;
        
        agendamentos = agendamentos.filter(ag => ag.id !== ultimoAgendamentoId);
        
        try {
            localStorage.setItem('agendamentos', JSON.stringify(agendamentos));
            
            const agendamentoCancelado = agendamentos.find(ag => ag.id === ultimoAgendamentoId);
            if (agendamentoCancelado) {
                enviarWhatsApp(agendamentoCancelado.telefone, 
                    `❌ *Agendamento Cancelado* ❌\n\nSeu agendamento para ${agendamentoCancelado.servicos} foi cancelado com sucesso.`);
                
                enviarWhatsApp('11967036990', 
                    `⚠️ *CANCELAMENTO* ⚠️\n\nAgendamento ${ultimoAgendamentoId} foi cancelado pelo cliente.`);
            }
            
            mostrarAlerta('Agendamento cancelado com sucesso!', 'success');
            modalCancelamento.hide();
            ultimoAgendamentoId = null;
            
        } catch (e) {
            console.error('Erro ao cancelar agendamento:', e);
            mostrarAlerta('Erro ao cancelar agendamento. Por favor, entre em contato diretamente.', 'danger');
        }
    }

    function mostrarAlerta(mensagem, tipo) {
        const alertasExistentes = document.querySelectorAll('.alert-flutuante');
        alertasExistentes.forEach(alerta => alerta.remove());
        
        const alerta = document.createElement('div');
        alerta.className = `alert alert-${tipo} alert-flutuante alert-dismissible fade show`;
        alerta.role = 'alert';
        alerta.innerHTML = `
            ${mensagem}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        `;
        
        formAgendamento.parentNode.insertBefore(alerta, formAgendamento);
        
        setTimeout(() => {
            alerta.classList.remove('show');
            setTimeout(() => alerta.remove(), 150);
        }, 5000);
    }
});