// ofensores-common.js
// Funções compartilhadas pelos relatórios de Ofensores (RS/SC).
// Preencha as configurações abaixo com os dados do seu projeto Supabase.

(function () {
  'use strict';

  // ====== CONFIGURAÇÃO — AJUSTE AQUI ======
  const SUPABASE_URL = 'https://gxsgolzyhlckffuxscgk.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_TA2pFI21qJ8V5uc7ZYl9PQ_--cPLySp';
  const TABELAS_POR_UF = {
    RS: 'ofensores_rs',
    SC: 'ofensores_sc',
  };
  const PAGINA_LOGIN = 'login.html'; // ajuste se o nome do arquivo de login for outro
  // ==========================================

  let _supabase = null;
  function getClient() {
    if (_supabase) return _supabase;
    if (
      !SUPABASE_URL || SUPABASE_URL.startsWith('COLE_AQUI') ||
      !SUPABASE_ANON_KEY || SUPABASE_ANON_KEY.startsWith('COLE_AQUI')
    ) {
      throw new Error('Supabase não configurado: edite SUPABASE_URL e SUPABASE_ANON_KEY em ofensores-common.js');
    }
    if (!window.supabase || !window.supabase.createClient) {
      throw new Error('Biblioteca do Supabase não carregou (verifique o <script> do supabase-js).');
    }
    _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return _supabase;
  }

  // ---------- Sessão ----------
  async function checarSessao() {
    try {
      const client = getClient();
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      if (!data || !data.session) {
        window.location.href = PAGINA_LOGIN;
        return null;
      }
      return data.session;
    } catch (e) {
      // Se o Supabase não estiver configurado ainda, não força redirecionamento —
      // deixa a página seguir e mostrar o erro real ao buscar os dados.
      console.warn('checarSessao:', msgErro(e));
      return null;
    }
  }

  // ---------- Busca de dados ----------
  async function buscarOfensores(uf) {
    const client = getClient();
    const tabela = TABELAS_POR_UF[uf];
    if (!tabela) throw new Error(`Nenhuma tabela configurada para a UF "${uf}".`);
    const { data, error } = await client
      .from(tabela)
      .select('*');
    if (error) throw error;
    return data || [];
  }

  // ---------- Utilidades ----------
  function esc(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function brl(valor) {
    const n = Number(valor) || 0;
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function msgErro(e) {
    if (!e) return 'Erro desconhecido.';
    return e.message || e.error_description || e.msg || String(e);
  }

  // Converte texto em formato monetário/numérico brasileiro (ex: "R$ 1.234,56", "1234,56", "1234.56") em número
  function parseNumero(v) {
    if (v === null || v === undefined) return 0;
    if (typeof v === 'number') return v;
    let s = String(v).trim();
    if (!s) return 0;
    s = s.replace(/[^\d,.-]/g, ''); // remove "R$", espaços, etc.
    if (!s) return 0;
    if (s.includes(',') && s.includes('.')) {
      // "1.234,56" -> ponto é milhar, vírgula é decimal
      s = s.replace(/\./g, '').replace(',', '.');
    } else if (s.includes(',')) {
      // "1234,56" -> vírgula é decimal
      s = s.replace(',', '.');
    }
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }

  function somaTotal(rows, campo) {
    return rows.reduce((acc, r) => acc + parseNumero(r[campo]), 0);
  }

  // Agrupa e conta ocorrências por valor de um campo (para os gráficos de barra)
  function agruparContagem(rows, campo) {
    const mapa = {};
    rows.forEach((r) => {
      const chave = (r[campo] || 'NÃO INFORMADO').toString();
      mapa[chave] = (mapa[chave] || 0) + 1;
    });
    return Object.entries(mapa)
      .map(([rotulo, valor]) => ({ rotulo, valor }))
      .sort((a, b) => b.valor - a.valor);
  }

  // Agrupa por uma chave e soma os campos numéricos indicados (para as tabelas)
  function agruparSoma(rows, chave, campos) {
    const mapa = {};
    rows.forEach((r) => {
      const k = (r[chave] || 'NÃO INFORMADO').toString();
      if (!mapa[k]) {
        mapa[k] = { rotulo: k, qtd: 0 };
        campos.forEach((c) => { mapa[k][c] = 0; });
      }
      mapa[k].qtd += 1;
      campos.forEach((c) => { mapa[k][c] += parseNumero(r[c]); });
    });
    const principal = campos[0];
    return Object.values(mapa).sort((a, b) => b[principal] - a[principal]);
  }

  // ---------- Renderização ----------
  const CORES_BARRA = ['#8b7fe8', '#14b8a6', '#f97316', '#34c98a', '#6d5bd0', '#e879f9'];

  function renderBars(container, dados) {
    if (!container) return;
    if (!dados.length) {
      container.innerHTML = '<p class="empty-msg">Sem dados.</p>';
      return;
    }
    const max = Math.max(...dados.map((d) => d.valor), 1);
    container.innerHTML = dados.map((d, i) => `
      <div class="bar-row">
        <div class="bar-label">${esc(d.rotulo)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${(d.valor / max * 100).toFixed(1)}%;background:${CORES_BARRA[i % CORES_BARRA.length]}"></div></div>
        <div class="bar-value">${d.valor}</div>
      </div>
    `).join('');
  }

  function renderTabelaGrupo(container, dados, colunas) {
    if (!container) return;
    const rotuloChave = container.getAttribute('data-chave-rotulo') || '';
    if (!dados.length) {
      container.innerHTML = '<p class="empty-msg">Sem dados.</p>';
      return;
    }
    const formatarValor = (col, valor) => col.moeda ? brl(valor) : (valor ?? 0);

    const totais = {};
    colunas.forEach((col) => {
      totais[col.campo] = dados.reduce((acc, r) => acc + (Number(r[col.campo]) || 0), 0);
    });

    const thead = `<thead><tr><th>${esc(rotuloChave)}</th>${colunas.map((c) => `<th>${esc(c.rotulo)}</th>`).join('')}</tr></thead>`;
    const tbody = `<tbody>${dados.map((r) => `
      <tr><td>${esc(r.rotulo)}</td>${colunas.map((c) => `<td>${formatarValor(c, r[c.campo])}</td>`).join('')}</tr>
    `).join('')}</tbody>`;
    const tfoot = `<tfoot><tr><td>TOTAL</td>${colunas.map((c) => `<td>${formatarValor(c, totais[c.campo])}</td>`).join('')}</tr></tfoot>`;

    container.innerHTML = `<table>${thead}${tbody}${tfoot}</table>`;
  }

  window.OfensoresComum = {
    checarSessao,
    buscarOfensores,
    esc,
    brl,
    msgErro,
    somaTotal,
    agruparContagem,
    agruparSoma,
    renderBars,
    renderTabelaGrupo,
  };
})();