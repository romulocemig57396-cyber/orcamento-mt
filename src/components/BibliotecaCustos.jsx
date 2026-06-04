import React, { useState, useMemo } from 'react';
import { 
  TABELA_CUSTOS, 
  ANOS_DISPONIVEIS, 
  getCategorias, 
  getSubcategorias,
  buscarItens,
  getValorPorAno,
  formatarValor 
} from '../data/tabelaCustos';

export default function BibliotecaCustos({ setOrcamento, anoReferencia, setAnoReferencia }) {
  const [textoBusca, setTextoBusca] = useState('');
  const [categoriaFiltro, setCategoriaFiltro] = useState('');
  const [subcategoriaFiltro, setSubcategoriaFiltro] = useState('');
  const [itemSelecionado, setItemSelecionado] = useState(null);
  const [modalAberto, setModalAberto] = useState(false);
  const [quantidade, setQuantidade] = useState('');
  const [categoriaDestino, setCategoriaDestino] = useState('cti');
  const [percentualCemig, setPercentualCemig] = useState('');

  // Filtrar itens
  const itensFiltrados = useMemo(() => {
    let itens = TABELA_CUSTOS;

    // Filtro por texto
    if (textoBusca) {
      itens = buscarItens(textoBusca);
    }

    // Filtro por categoria
    if (categoriaFiltro) {
      itens = itens.filter(item => item.categoria === categoriaFiltro);
    }

    // Filtro por subcategoria
    if (subcategoriaFiltro) {
      itens = itens.filter(item => item.subcategoria === subcategoriaFiltro);
    }

    return itens;
  }, [textoBusca, categoriaFiltro, subcategoriaFiltro]);

  const categorias = getCategorias();
  const subcategorias = categoriaFiltro ? getSubcategorias(categoriaFiltro) : [];

  const abrirModal = (item) => {
    setItemSelecionado(item);
    setModalAberto(true);
    setQuantidade('');
    setCategoriaDestino('cti');
    setPercentualCemig('');
  };

  const fecharModal = () => {
    setModalAberto(false);
    setItemSelecionado(null);
  };

  const adicionarAoOrcamento = () => {
    if (!itemSelecionado || !quantidade || parseFloat(quantidade) <= 0) {
      alert('Preencha a quantidade corretamente');
      return;
    }

    if (categoriaDestino === 'pp' && (!percentualCemig || percentualCemig < 0 || percentualCemig > 100)) {
      alert('Para categoria PP, informe o % CEMIG (0-100)');
      return;
    }

    const unitario = getValorPorAno(itemSelecionado, anoReferencia, 'unitario');
    const valorTotal = unitario * parseFloat(quantidade);

    const novoItem = {
      id: Date.now(),
      descricao: `${itemSelecionado.tipo} (${parseFloat(quantidade)} ${itemSelecionado.unidade})`,
      categoria: categoriaDestino,
      valor: valorTotal,
      percentualCemig: categoriaDestino === 'pp' ? parseFloat(percentualCemig) : 0,
      origem: 'biblioteca',
      itemOrigem: itemSelecionado.id,
      quantidade: parseFloat(quantidade),
      unidade: itemSelecionado.unidade,
      valorUnitario: unitario,
    };

    setOrcamento(prev => ({
      ...prev,
      itensObra: [...prev.itensObra, novoItem]
    }));

    alert(`✅ Item adicionado ao orçamento: ${novoItem.descricao}`);
    fecharModal();
  };

  const limparFiltros = () => {
    setTextoBusca('');
    setCategoriaFiltro('');
    setSubcategoriaFiltro('');
  };

  return (
    <div className="card">
      <h2 className="text-2xl font-bold mb-6 text-gray-800 border-b pb-2">
        📚 Biblioteca de Custos
      </h2>

      {/* Seletor de Ano de Referência */}
      <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
        <label className="label font-bold text-blue-800">Ano de Referência:</label>
        <div className="flex gap-3 mt-2">
          {ANOS_DISPONIVEIS.map(ano => (
            <button
              key={ano.ano}
              onClick={() => setAnoReferencia(ano.ano)}
              className={`px-4 py-2 rounded-md font-semibold transition-colors ${
                anoReferencia === ano.ano
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-blue-600 border border-blue-300 hover:bg-blue-50'
              }`}
            >
              {ano.label}
            </button>
          ))}
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-gray-50 p-4 rounded-lg mb-4">
        <h3 className="font-semibold mb-3 text-gray-700">🔍 Filtros</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2">
            <input
              type="text"
              value={textoBusca}
              onChange={(e) => setTextoBusca(e.target.value)}
              className="input-field"
              placeholder="Buscar por nome..."
            />
          </div>

          <div>
            <select
              value={categoriaFiltro}
              onChange={(e) => {
                setCategoriaFiltro(e.target.value);
                setSubcategoriaFiltro('');
              }}
              className="input-field"
            >
              <option value="">Todas as categorias</option>
              {categorias.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={subcategoriaFiltro}
              onChange={(e) => setSubcategoriaFiltro(e.target.value)}
              className="input-field"
              disabled={!categoriaFiltro}
            >
              <option value="">Todas as subcategorias</option>
              {subcategorias.map(sub => (
                <option key={sub} value={sub}>{sub}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-3 flex justify-between items-center">
          <p className="text-sm text-gray-600">
            {itensFiltrados.length} {itensFiltrados.length === 1 ? 'item encontrado' : 'itens encontrados'}
          </p>
          <button onClick={limparFiltros} className="text-sm text-blue-600 hover:text-blue-800">
            Limpar filtros
          </button>
        </div>
      </div>

      {/* Tabela de Itens */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 sticky top-0">
            <tr>
              <th className="px-3 py-2 text-left">Categoria</th>
              <th className="px-3 py-2 text-left">Tipo</th>
              <th className="px-3 py-2 text-center">Unid.</th>
              <th className="px-3 py-2 text-right">Material</th>
              <th className="px-3 py-2 text-right">Mão Obra</th>
              <th className="px-3 py-2 text-right">US Constr.</th>
              <th className="px-3 py-2 text-right">Total (R$ mil)</th>
              <th className="px-3 py-2 text-center">Ação</th>
            </tr>
          </thead>
          <tbody>
            {itensFiltrados.length === 0 ? (
              <tr>
                <td colSpan="8" className="text-center py-8 text-gray-500">
                  Nenhum item encontrado com os filtros aplicados
                </td>
              </tr>
            ) : (
              itensFiltrados.map(item => {
                const material = getValorPorAno(item, anoReferencia, 'material');
                const maoObra = getValorPorAno(item, anoReferencia, 'maoObra');
                const usConstr = getValorPorAno(item, anoReferencia, 'usConstr');
                const unitario = getValorPorAno(item, anoReferencia, 'unitario');

                return (
                  <tr key={item.id} className="border-b hover:bg-blue-50">
                    <td className="px-3 py-2">
                      <div className="text-xs text-gray-500">{item.categoria}</div>
                      {item.subcategoria && (
                        <div className="text-xs text-gray-400">{item.subcategoria}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 font-medium">{item.tipo}</td>
                    <td className="px-3 py-2 text-center text-gray-600">{item.unidade}</td>
                    <td className="px-3 py-2 text-right">{formatarValor(material)}</td>
                    <td className="px-3 py-2 text-right">{formatarValor(maoObra)}</td>
                    <td className="px-3 py-2 text-right">{formatarValor(usConstr)}</td>
                    <td className="px-3 py-2 text-right font-bold text-blue-600">
                      {formatarValor(unitario)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        onClick={() => abrirModal(item)}
                        className="bg-green-600 text-white px-3 py-1 rounded text-xs hover:bg-green-700"
                      >
                        ➕ Adicionar
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal de Adição */}
      {modalAberto && itemSelecionado && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-bold mb-4 text-gray-800">
              Adicionar ao Orçamento
            </h3>

            <div className="mb-4 p-3 bg-gray-50 rounded">
              <p className="font-semibold text-gray-700">{itemSelecionado.tipo}</p>
              <p className="text-sm text-gray-600">
                {itemSelecionado.categoria} {itemSelecionado.subcategoria && `→ ${itemSelecionado.subcategoria}`}
              </p>
              <p className="text-lg font-bold text-blue-600 mt-2">
                R$ {formatarValor(getValorPorAno(itemSelecionado, anoReferencia, 'unitario'))} mil / {itemSelecionado.unidade}
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="label">Quantidade ({itemSelecionado.unidade})</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={quantidade}
                  onChange={(e) => setQuantidade(e.target.value)}
                  className="input-field"
                  placeholder="Ex: 14.84"
                  autoFocus
                />
              </div>

              <div>
                <label className="label">Categoria de Destino</label>
                <select
                  value={categoriaDestino}
                  onChange={(e) => setCategoriaDestino(e.target.value)}
                  className="input-field"
                >
                  <option value="cti">CTI - Cond. Téc. Interessado</option>
                  <option value="ctc">CTC - Cond. Téc. CEMIG</option>
                  <option value="pp">PP - Proporcionalidade</option>
                  <option value="parcela_reg">Parcela Regulatória</option>
                </select>
              </div>

              {categoriaDestino === 'pp' && (
                <div>
                  <label className="label">% CEMIG (Proporcionalidade)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={percentualCemig}
                    onChange={(e) => setPercentualCemig(e.target.value)}
                    className="input-field"
                    placeholder="Ex: 29"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    % que a CEMIG paga. O resto vai para Parcela Regulatória.
                  </p>
                </div>
              )}

              {quantidade && (
                <div className="p-3 bg-green-50 rounded border border-green-200">
                  <p className="text-sm font-semibold text-green-800">Valor Total:</p>
                  <p className="text-2xl font-bold text-green-600">
                    R$ {formatarValor(getValorPorAno(itemSelecionado, anoReferencia, 'unitario') * parseFloat(quantidade))} mil
                  </p>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={fecharModal}
                className="btn-secondary flex-1"
              >
                Cancelar
              </button>
              <button
                onClick={adicionarAoOrcamento}
                className="btn-success flex-1"
              >
                ✅ Adicionar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
        <h4 className="font-semibold text-blue-800 mb-2">ℹ️ Como usar:</h4>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>1. Selecione o <strong>ano de referência</strong> dos custos</li>
          <li>2. Use os <strong>filtros</strong> para encontrar o item desejado</li>
          <li>3. Clique em <strong>"Adicionar"</strong> no item</li>
          <li>4. Informe a <strong>quantidade</strong> e a <strong>categoria</strong></li>
          <li>5. O item será adicionado automaticamente aos Itens de Obra</li>
        </ul>
      </div>
    </div>
  );
}