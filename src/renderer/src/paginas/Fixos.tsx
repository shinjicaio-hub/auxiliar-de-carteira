import { useState } from 'react'
import { formatarMes, formatarMesCurto } from '../../../shared/datas'
import { formatarReais } from '../../../shared/dinheiro'
import { ROTULOS_FORMA, type Ocorrencia } from '../../../shared/tipos'
import { chamar, useDados } from '../api'
import { Aviso, Valor } from '../componentes/Basicos'
import {
  DialogoEncerrar,
  DialogoExcluir,
  DialogoRealizado
} from '../componentes/DialogosOcorrencia'
import { FormFixo } from '../componentes/FormFixo'
import { FormLancamento } from '../componentes/FormLancamento'

type Acao =
  | { tipo: 'nova-renda' | 'nova-despesa' }
  | { tipo: 'realizado' | 'editar' | 'encerrar' | 'excluir'; ocorrencia: Ocorrencia }

const somar = (itens: Ocorrencia[]) => itens.reduce((t, o) => t + o.previstoCentavos, 0)

function agruparPorCategoria(
  itens: Ocorrencia[],
  nomeDe: (o: Ocorrencia) => string
): [string, Ocorrencia[]][] {
  const grupos = new Map<string, Ocorrencia[]>()
  for (const item of itens) {
    const nome = nomeDe(item)
    grupos.set(nome, [...(grupos.get(nome) ?? []), item])
  }
  return [...grupos.entries()].sort(([a], [b]) => {
    if (a === 'Sem categoria') return 1
    if (b === 'Sem categoria') return -1
    return a.localeCompare(b, 'pt-BR')
  })
}

function LinhaFixo({ o, aoAgir }: { o: Ocorrencia; aoAgir: (a: Acao) => void }) {
  return (
    <tr>
      <td>
        <div className="nome-item">{o.nome}</div>
        {o.mesEncerramento && (
          <div className="nota-celula">Até {formatarMesCurto(o.mesEncerramento)}</div>
        )}
      </td>
      <td className="sem-quebra">Dia {o.diaOriginal}</td>
      <td>
        {o.formaPagamento ? ROTULOS_FORMA[o.formaPagamento] : '—'}
        {o.fatura && <div className="nota-celula">Fatura: {o.fatura}</div>}
      </td>
      <td className="numero">
        <Valor centavos={o.previstoCentavos} />
        {o.realizadoCentavos !== null && (
          <div className="nota-celula">
            {o.tipo === 'receita' ? 'Recebido' : 'Pago'} {formatarReais(o.realizadoCentavos)}
          </div>
        )}
      </td>
      <td>
        <div className="acoes-linha">
          <button
            type="button"
            className="botao botao-pequeno"
            onClick={() => aoAgir({ tipo: 'realizado', ocorrencia: o })}
          >
            {o.realizadoCentavos !== null ? 'Ajustar' : o.tipo === 'receita' ? 'Receber' : 'Pagar'}
          </button>
          <button
            type="button"
            className="botao botao-pequeno"
            onClick={() => aoAgir({ tipo: 'editar', ocorrencia: o })}
          >
            Editar
          </button>
          <button
            type="button"
            className="botao botao-pequeno"
            onClick={() => aoAgir({ tipo: 'encerrar', ocorrencia: o })}
          >
            Encerrar
          </button>
          <button
            type="button"
            className="botao botao-pequeno botao-texto-perigo"
            onClick={() => aoAgir({ tipo: 'excluir', ocorrencia: o })}
          >
            Excluir
          </button>
        </div>
      </td>
    </tr>
  )
}

function Cabecalho() {
  return (
    <thead>
      <tr>
        <th>Nome</th>
        <th>Data</th>
        <th>Pagamento</th>
        <th className="numero">Valor mensal</th>
        <th>Ações</th>
      </tr>
    </thead>
  )
}

export function Fixos({
  mes,
  hoje,
  chave,
  aoAlterar
}: {
  mes: string
  hoje: string
  chave: number
  aoAlterar: () => void
}) {
  const { dados, erro } = useDados(async () => {
    const [lista, categorias] = await Promise.all([
      chamar('listarMes', mes),
      chamar('listarCategorias')
    ])
    return { lista, categorias }
  }, `${mes}:${chave}`)
  const [acao, setAcao] = useState<Acao | null>(null)

  if (erro) return <Aviso tipo="erro">{erro}</Aviso>
  if (!dados) return null

  const { lista, categorias } = dados
  const nomes = new Map(categorias.map((c) => [c.id, c.nome]))
  const nomeDe = (o: Ocorrencia) =>
    (o.categoriaId !== null && nomes.get(o.categoriaId)) || 'Sem categoria'

  const fixos = lista.filter((o) => o.repeticao === 'recorrente')
  const rendas = fixos.filter((o) => o.tipo === 'receita')
  const despesas = fixos.filter((o) => o.tipo === 'compromisso')
  const totalRenda = somar(rendas)
  const totalDespesas = somar(despesas)
  const faturas = [...new Set(lista.flatMap((o) => (o.fatura ? [o.fatura] : [])))].sort()

  function concluir() {
    setAcao(null)
    aoAlterar()
  }

  return (
    <div className="pilha">
      <div className="barra-ferramentas">
        <button
          type="button"
          className="botao botao-primario"
          onClick={() => setAcao({ tipo: 'nova-renda' })}
        >
          Adicionar renda fixa
        </button>
        <button
          type="button"
          className="botao botao-primario"
          onClick={() => setAcao({ tipo: 'nova-despesa' })}
        >
          Adicionar despesa fixa
        </button>
      </div>

      {fixos.length === 0 ? (
        <div className="vazio">
          <h3>Nada fixo em {formatarMes(mes)}</h3>
          <p>
            Cadastre seu salário e suas contas uma única vez. Eles aparecem sozinhos todos os meses
            até você encerrar.
          </p>
        </div>
      ) : (
        <>
          <div className="grade-cartoes">
            <section className="cartao">
              <h3>Renda fixa</h3>
              <p className="total-cartao" data-testid="total-renda-fixa">
                <Valor centavos={totalRenda} forte />
              </p>
            </section>
            <section className="cartao">
              <h3>Despesas fixas</h3>
              <p className="total-cartao" data-testid="total-despesas-fixas">
                <Valor centavos={totalDespesas} forte />
              </p>
            </section>
            <section className="cartao">
              <h3>Sobra depois dos fixos</h3>
              <p className="total-cartao" data-testid="sobra-fixos">
                <Valor centavos={totalRenda - totalDespesas} forte />
              </p>
            </section>
          </div>

          <section className="painel">
            <h3>Renda fixa</h3>
            {rendas.length === 0 ? (
              <p className="nota">Nenhuma renda fixa neste mês.</p>
            ) : (
              <table className="tabela">
                <Cabecalho />
                <tbody>
                  {rendas.map((o) => (
                    <LinhaFixo key={o.serieId} o={o} aoAgir={setAcao} />
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="painel">
            <h3>Despesas fixas por categoria</h3>
            {despesas.length === 0 ? (
              <p className="nota">Nenhuma despesa fixa neste mês.</p>
            ) : (
              <table className="tabela">
                <Cabecalho />
                {agruparPorCategoria(despesas, nomeDe).map(([categoria, itens]) => (
                  <tbody key={categoria}>
                    <tr className="linha-grupo">
                      <td colSpan={3}>{categoria}</td>
                      <td className="numero">
                        <Valor centavos={somar(itens)} forte />
                      </td>
                      <td />
                    </tr>
                    {itens.map((o) => (
                      <LinhaFixo key={o.serieId} o={o} aoAgir={setAcao} />
                    ))}
                  </tbody>
                ))}
              </table>
            )}
          </section>

          <p className="nota">
            Valores previstos para {formatarMes(mes)}. Parcelas e compras únicas ficam em
            Lançamentos.
          </p>
        </>
      )}

      {(acao?.tipo === 'nova-renda' || acao?.tipo === 'nova-despesa') && (
        <FormFixo
          tipo={acao.tipo === 'nova-renda' ? 'receita' : 'compromisso'}
          mes={mes}
          categorias={categorias}
          faturas={faturas}
          aoFechar={() => setAcao(null)}
          aoSalvar={concluir}
        />
      )}
      {acao?.tipo === 'editar' && (
        <FormLancamento
          mes={mes}
          hoje={hoje}
          categorias={categorias}
          faturas={faturas}
          ocorrencia={acao.ocorrencia}
          escopoInicial="a_partir"
          aoFechar={() => setAcao(null)}
          aoSalvar={concluir}
        />
      )}
      {acao?.tipo === 'realizado' && (
        <DialogoRealizado
          ocorrencia={acao.ocorrencia}
          aoFechar={() => setAcao(null)}
          aoSalvar={concluir}
        />
      )}
      {acao?.tipo === 'encerrar' && (
        <DialogoEncerrar
          ocorrencia={acao.ocorrencia}
          aoFechar={() => setAcao(null)}
          aoSalvar={concluir}
        />
      )}
      {acao?.tipo === 'excluir' && (
        <DialogoExcluir
          ocorrencia={acao.ocorrencia}
          aoFechar={() => setAcao(null)}
          aoSalvar={concluir}
        />
      )}
    </div>
  )
}
