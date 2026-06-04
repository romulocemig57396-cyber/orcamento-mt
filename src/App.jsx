import React, { useState } from 'react';
import { useOrcamento } from './hooks/useOrcamento';
import DadosAtendimento from './components/DadosAtendimento';
import ItensObra from './components/ItensObra';
import RateioTecnico from './components/RateioTecnico';
import MateriaisAuxiliares from './components/MateriaisAuxiliares';
import DescricaoTecnica from './components/DescricaoTecnica';
import ResumoFinanceiro from './components/ResumoFinanceiro';
import Exportacao from './components/Exportacao';
import BibliotecaCustos from './components/BibliotecaCustos';

const abas = [
  { id: 'atendimento', nome: 'Atendimento' },
  { id: 'biblioteca',  nome: 'Biblioteca Custos' },
  { id: 'itens',       nome: 'Itens de Obra' },
  { id: 'rateio',      nome: 'Rateio' },
  { id: 'materiais',   nome: 'Materiais' },
  { id: 'descricao',   nome: 'Descrição Técnica' },
  { id: 'resumo',      nome: 'Resumo Financeiro' },
  { id: 'exportacao',  nome: 'Exportar' },
];

function App() {
  const { orcamento, updateField, resetOrcamento, setOrcamento } = useOrcamento();
  const [abaAtiva, setAbaAtiva] = useState('atendimento');
  const [anoReferencia, setAnoReferencia] = useState(2024);

  const abaAtual = abas.find(a => a.id === abaAtiva);

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#F5F5F5' }}>

      {/* ── Sidebar Cemig ── */}
      <aside style={{
        width: '224px',
        minWidth: '224px',
        background: '#007A3D',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
      }}>

        {/* Brand */}
        <div style={{
          padding: '18px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.12)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '8px',
              background: '#005C2E', display: 'flex', alignItems: 'center',
              justifyContent: 'center', flexShrink: 0,
            }}>
              <span style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 900, fontSize: '13px', color: '#FFD100', letterSpacing: '-0.5px' }}>MT</span>
            </div>
            <div>
              <p style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '13px', color: '#fff', margin: 0, lineHeight: 1.3 }}>
                Orçamento MT
              </p>
              <p style={{ fontFamily: "'Open Sans', sans-serif", fontSize: '10px', color: 'rgba(255,255,255,0.5)', margin: 0, marginTop: '1px' }}>
                Média Tensão
              </p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '12px 10px', overflowY: 'auto' }}>
          <p style={{
            fontSize: '9px', fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.15em', color: 'rgba(255,255,255,0.4)',
            padding: '0 8px', marginBottom: '8px', marginTop: '4px',
          }}>Navegação</p>

          {abas.map(aba => (
            <button
              key={aba.id}
              onClick={() => setAbaAtiva(aba.id)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 10px',
                borderRadius: '7px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: abaAtiva === aba.id ? 600 : 400,
                fontFamily: "'Open Sans', sans-serif",
                textAlign: 'left',
                marginBottom: '2px',
                transition: 'all 0.15s',
                background: abaAtiva === aba.id ? '#00A859' : 'transparent',
                color: abaAtiva === aba.id ? '#fff' : 'rgba(255,255,255,0.75)',
                boxShadow: abaAtiva === aba.id ? '0 2px 8px rgba(0,0,0,0.2)' : 'none',
              }}
              onMouseEnter={e => { if (abaAtiva !== aba.id) e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
              onMouseLeave={e => { if (abaAtiva !== aba.id) e.currentTarget.style.background = 'transparent'; }}
            >
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {aba.nome}
              </span>
              {abaAtiva === aba.id && (
                <span style={{
                  width: '5px', height: '5px', borderRadius: '50%',
                  background: '#FFD100', flexShrink: 0,
                }} />
              )}
            </button>
          ))}
        </nav>

        {/* Footer */}
        <div style={{
          padding: '12px 16px',
          borderTop: '1px solid rgba(255,255,255,0.1)',
          flexShrink: 0,
        }}>
          <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', textAlign: 'center', margin: 0 }}>
            CEMIG · Orçamento MT
          </p>
        </div>
      </aside>

      {/* ── Main area ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Top bar */}
        <header style={{
          background: '#fff',
          borderBottom: '1px solid #E8E8E8',
          padding: '0 32px',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          flexShrink: 0,
          height: '60px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        }}>
          {/* Breadcrumb / título */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
            <div style={{
              width: '4px', height: '32px', borderRadius: '2px',
              background: '#00A859', flexShrink: 0,
            }} />
            <div>
              <h1 style={{
                fontFamily: "'Montserrat', sans-serif",
                fontSize: '15px', fontWeight: 800,
                color: '#007A3D', margin: 0,
                textTransform: 'uppercase', letterSpacing: '0.05em',
              }}>
                {abaAtual?.nome}
              </h1>
              <p style={{ fontSize: '12px', color: '#AAA', margin: 0, fontFamily: "'Open Sans', sans-serif" }}>
                Orçamento de Obras — Média Tensão
              </p>
            </div>
          </div>

          {/* Badge status */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            fontSize: '12px', fontWeight: 600, fontFamily: "'Open Sans', sans-serif",
            color: '#007A3D', background: '#E7F4EE',
            padding: '6px 14px', borderRadius: '20px',
            border: '1px solid #B8E6CC',
            flexShrink: 0,
          }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#00A859', display: 'inline-block', flexShrink: 0 }} />
            Salvo automaticamente
          </div>
        </header>

        {/* Page content */}
        <main style={{ flex: 1, overflowY: 'auto', padding: '28px 32px', background: '#F5F5F5' }}>
          <div style={{ maxWidth: '960px', width: '100%' }}>

            {abaAtiva === 'atendimento' && (
              <DadosAtendimento dados={orcamento} updateField={updateField} />
            )}
            {abaAtiva === 'biblioteca' && (
              <BibliotecaCustos
                setOrcamento={setOrcamento}
                anoReferencia={anoReferencia}
                setAnoReferencia={setAnoReferencia}
              />
            )}
            {abaAtiva === 'itens' && (
              <ItensObra itens={orcamento.itensObra} setOrcamento={setOrcamento} />
            )}
            {abaAtiva === 'rateio' && (
              <RateioTecnico dados={orcamento} setOrcamento={setOrcamento} />
            )}
            {abaAtiva === 'materiais' && (
              <MateriaisAuxiliares
                materiais={orcamento.materiaisAuxiliares}
                setOrcamento={setOrcamento}
              />
            )}
            {abaAtiva === 'descricao' && (
              <DescricaoTecnica dados={orcamento} setOrcamento={setOrcamento} />
            )}
            {abaAtiva === 'resumo' && (
              <ResumoFinanceiro dados={{ ...orcamento, setOrcamento }} />
            )}
            {abaAtiva === 'exportacao' && (
              <Exportacao orcamento={orcamento} resetOrcamento={resetOrcamento} />
            )}

          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
