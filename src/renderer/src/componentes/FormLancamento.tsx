import { useEffect, useState, type FormEvent } from 'react'
import { CODIGO_REALIZADAS_FUTURAS } from '../../../shared/api'
import {
  dataNoMes,
  dataValida,
  formatarMesCurto,
  mesDaData,
  mesValido,
  somarMeses
} from '../../../shared/datas'
import { centavosParaCampo, formatarReais, reaisParaCentavos } from '../../../shared/dinheiro'
import {
  esquemaCriarLancamento,
  esquemaEditarAPartirDe,
  esquemaEditarOcorrencia,
  primeiraMensagem
} from '../../../shared/esquemas'
import {
  ehReserva,
  FORMAS_PAGAMENTO,
  REPETICOES,
  reservaAceitaPor,
  ROTULOS_FORMA,
  ROTULOS_REPETICAO,
  ROTULOS_TIPO,
  TIPOS,
  type Categoria,
  type FormaPagamento,
  type Ocorrencia,
  type Repeticao,
  type Tipo,
  type UsoReserva
} from '../../../shared/tipos'
import { chamar, ErroApi, mensagemDe } from '../api'
import { Aviso, Confirmacao, Dialogo } from './Basicos'

const AJUDA_TIPO: Record<Tipo, string> = {
  receita: 'Dinheiro que você vai receber, como salário ou freela.',
  compromisso: 'Conta com nome próprio: internet, academia, parcela de um celular.',
  investimento: 'Valor que você separa para investir. Reduz o dinheiro livre como um compromisso.',
  lazer: 'Dinheiro reservado para atividades já previstas. Ainda não é uma despesa.',
  gasto_livre: 'Despesa feita com o dinheiro que sobrou, ou que consome uma reserva de lazer.',
  aporte: 'Valor efetivamente investido. Pode consumir uma reserva de investimento.'
}

export interface ValoresIniciais {
  tipo?: Tipo
  reservaSerieId?: number
  nome?: string
}

interface Props {
  mes: string
  hoje: string
  categorias: Categoria[]
  faturas: string[]
  /** Presente ao editar; ausente ao criar. */
  ocorrencia?: Ocorrencia
  iniciais?: ValoresIniciais
  /** Escopo já marcado ao abrir a edição. */
  escopoInicial?: 'esta' | 'a_partir'
  aoFechar: () => void
  aoSalvar: () => void
}

export function FormLancamento({
  mes,
  hoje,
  categorias,
  faturas,
  ocorrencia,
  iniciais,
  escopoInicial = 'esta',
  aoFechar,
  aoSalvar
}: Props) {
  const editando = ocorrencia !== undefined
  const dataPadrao = mesDaData(hoje) === mes ? hoje : `${mes}-01`
  const tipoInicial = ocorrencia?.tipo ?? iniciais?.tipo ?? 'compromisso'

  const [tipo, setTipo] = useState<Tipo>(tipoInicial)
  const [repeticao, setRepeticao] = useState<Repeticao>(ocorrencia?.repeticao ?? 'unico')
  const [nome, setNome] = useState(ocorrencia?.nome ?? iniciais?.nome ?? '')
  const [valor, setValor] = useState(
    ocorrencia ? centavosParaCampo(ocorrencia.previstoCentavos) : ''
  )
  const [data, setData] = useState(ocorrencia?.data ?? dataPadrao)
  const [dia, setDia] = useState(String(ocorrencia?.diaOriginal ?? ''))
  const [parcelasTotal, setParcelasTotal] = useState(String(ocorrencia?.parcelasTotal ?? ''))
  const [parcelaInicial, setParcelaInicial] = useState('1')
  const [categoriaId, setCategoriaId] = useState(String(ocorrencia?.categoriaId ?? ''))
  const [forma, setForma] = useState<string>(ocorrencia?.formaPagamento ?? '')
  const [fatura, setFatura] = useState(ocorrencia?.fatura ?? '')
  const [reservaId, setReservaId] = useState(
    String(ocorrencia?.reservaSerieId ?? iniciais?.reservaSerieId ?? '')
  )
  const [observacao, setObservacao] = useState(ocorrencia?.observacao ?? '')
  const [jaRealizado, setJaRealizado] = useState(
    tipoInicial === 'gasto_livre' || tipoInicial === 'aporte'
  )
  const [escopo, setEscopo] = useState<'esta' | 'a_partir'>(escopoInicial)
  const [aPartirDe, setAPartirDe] = useState(mes)
  const [reservas, setReservas] = useState<UsoReserva[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [confirmarPerda, setConfirmarPerda] = useState<number | null>(null)

  const tipoReserva = reservaAceitaPor(tipo)
  const mesDaReserva = dataValida(data) ? mesDaData(data) : mes

  useEffect(() => {
    if (!tipoReserva) {
      setReservas([])
      return
    }
    let ativo = true
    chamar('resumoMes', mesDaReserva).then(
      (r) => {
        if (ativo) setReservas(r.reservas.filter((x) => x.tipo === tipoReserva))
      },
      () => {
        if (ativo) setReservas([])
      }
    )
    return () => {
      ativo = false
    }
  }, [tipoReserva, mesDaReserva])

  function trocarTipo(novo: Tipo) {
    setTipo(novo)
    setReservaId('')
    setJaRealizado(novo === 'gasto_livre' || novo === 'aporte')
  }

  const valorCentavos = reaisParaCentavos(valor)
  const total = Number(parcelasTotal)
  const inicial = editando ? null : Number(parcelaInicial)
  const parcelado = repeticao === 'parcelado'
  const mostraParcelas = parcelado && (!editando || escopo === 'a_partir')
  const reserva = ehReserva(tipo)

  const campos = {
    nome,
    valorCentavos: valorCentavos ?? Number.NaN,
    categoriaId: categoriaId ? Number(categoriaId) : null,
    formaPagamento: (forma || null) as FormaPagamento | null,
    fatura: fatura || null,
    reservaSerieId: tipoReserva && reservaId ? Number(reservaId) : null,
    observacao: observacao || null
  }

  async function salvar(confirmarRealizadas: boolean) {
    setErro(null)
    if (valorCentavos === null) {
      setErro('Informe o valor em reais, por exemplo 1.234,56.')
      return
    }

    let operacao: () => Promise<void>
    if (!ocorrencia) {
      const r = esquemaCriarLancamento.safeParse({
        ...campos,
        tipo,
        repeticao,
        data,
        parcelaInicial: parcelado ? Number(parcelaInicial) : null,
        parcelasTotal: parcelado ? Number(parcelasTotal) : null,
        jaRealizado: !reserva && jaRealizado
      })
      if (!r.success) return setErro(primeiraMensagem(r.error))
      operacao = () => chamar('criarLancamento', r.data)
    } else if (escopo === 'a_partir' && ocorrencia.repeticao !== 'unico') {
      if (!mesValido(aPartirDe)) return setErro('Informe o mês a partir do qual a alteração vale.')
      const r = esquemaEditarAPartirDe.safeParse({
        ...campos,
        serieId: ocorrencia.serieId,
        aPartirDe,
        dia: Number(dia),
        parcelasTotal: parcelado ? Number(parcelasTotal) : null,
        confirmarRealizadas
      })
      if (!r.success) return setErro(primeiraMensagem(r.error))
      operacao = () => chamar('editarAPartirDe', r.data)
    } else {
      const r = esquemaEditarOcorrencia.safeParse({
        ...campos,
        serieId: ocorrencia.serieId,
        mes: ocorrencia.mes,
        data
      })
      if (!r.success) return setErro(primeiraMensagem(r.error))
      operacao = () => chamar('editarOcorrencia', r.data)
    }

    setSalvando(true)
    try {
      await operacao()
      aoSalvar()
    } catch (e) {
      if (e instanceof ErroApi && e.codigo === CODIGO_REALIZADAS_FUTURAS) {
        setConfirmarPerda(e.quantidade ?? 1)
      } else {
        setErro(mensagemDe(e))
      }
    } finally {
      setSalvando(false)
    }
  }

  function aoEnviar(e: FormEvent) {
    e.preventDefault()
    void salvar(false)
  }

  const categoriasVisiveis = categorias.filter(
    (c) => c.ativa || c.id === ocorrencia?.categoriaId
  )
  const rotuloValor = parcelado
    ? 'Valor de cada parcela (R$)'
    : reserva
      ? 'Valor reservado (R$)'
      : editando
        ? reservaAceitaPor(tipo)
          ? 'Valor (R$)'
          : 'Valor previsto (R$)'
        : 'Valor (R$)'
  const rotuloData =
    repeticao === 'unico' ? 'Data' : parcelado ? 'Primeiro vencimento' : 'Primeira data'

  return (
    <Dialogo titulo={editando ? 'Editar lançamento' : 'Novo lançamento'} aoFechar={aoFechar} largo>
      <form onSubmit={aoEnviar} noValidate>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}

        {ocorrencia && ocorrencia.repeticao !== 'unico' && (
          <fieldset className="grupo-escopo">
            <legend>O que você quer alterar?</legend>
            <label className="opcao">
              <input
                type="radio"
                name="escopo"
                checked={escopo === 'esta'}
                onChange={() => setEscopo('esta')}
              />
              Só esta ocorrência ({formatarMesCurto(ocorrencia.mes)})
            </label>
            <label className="opcao">
              <input
                type="radio"
                name="escopo"
                checked={escopo === 'a_partir'}
                onChange={() => setEscopo('a_partir')}
              />
              Esta e as próximas, a partir de um mês
            </label>
            {escopo === 'a_partir' && (
              <div className="campo campo-curto">
                <label htmlFor="a-partir">A partir de</label>
                <input
                  id="a-partir"
                  type="month"
                  value={aPartirDe}
                  min={ocorrencia.mesInicial}
                  max={ocorrencia.ultimoMes ?? undefined}
                  onChange={(e) => setAPartirDe(e.target.value)}
                />
                <small>
                  Os meses anteriores não mudam. Exceções feitas só em um mês continuam valendo.
                </small>
              </div>
            )}
          </fieldset>
        )}

        {ocorrencia && ocorrencia.realizadoCentavos !== null && !reservaAceitaPor(tipo) && (
          <p className="nota-form aviso-no-form">
            Este mês já tem valor realizado de {formatarReais(ocorrencia.realizadoCentavos)}, que
            continua valendo. Para mudá-lo, use o botão Ajustar na lista.
          </p>
        )}

        <div className="grade-form">
          <div className="campo campo-inteiro">
            <label htmlFor="tipo">Tipo</label>
            <select
              id="tipo"
              value={tipo}
              disabled={editando}
              onChange={(e) => trocarTipo(e.target.value as Tipo)}
            >
              {TIPOS.map((t) => (
                <option key={t} value={t}>
                  {ROTULOS_TIPO[t]}
                </option>
              ))}
            </select>
            <small>{AJUDA_TIPO[tipo]}</small>
          </div>

          <div className="campo campo-inteiro">
            <label htmlFor="nome">Nome</label>
            <input
              id="nome"
              value={nome}
              maxLength={120}
              autoFocus
              onChange={(e) => setNome(e.target.value)}
            />
          </div>

          <div className="campo">
            <label htmlFor="repeticao">Repetição</label>
            <select
              id="repeticao"
              value={repeticao}
              disabled={editando}
              onChange={(e) => setRepeticao(e.target.value as Repeticao)}
            >
              {REPETICOES.map((r) => (
                <option key={r} value={r}>
                  {ROTULOS_REPETICAO[r]}
                </option>
              ))}
            </select>
          </div>

          <div className="campo">
            <label htmlFor="valor">{rotuloValor}</label>
            <input
              id="valor"
              inputMode="decimal"
              placeholder="0,00"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
            />
          </div>

          {mostraParcelas && (
            <>
              <div className="campo">
                <label htmlFor="parcelas-total">Total de parcelas</label>
                <input
                  id="parcelas-total"
                  type="number"
                  min={1}
                  max={600}
                  value={parcelasTotal}
                  onChange={(e) => setParcelasTotal(e.target.value)}
                />
              </div>
              {!editando && (
                <div className="campo">
                  <label htmlFor="parcela-inicial">Parcela neste primeiro mês</label>
                  <input
                    id="parcela-inicial"
                    type="number"
                    min={1}
                    max={600}
                    value={parcelaInicial}
                    onChange={(e) => setParcelaInicial(e.target.value)}
                  />
                  <small>Use mais que 1 se a compra já estiver em andamento.</small>
                </div>
              )}
              {valorCentavos !== null && total >= 1 && (
                <p className="nota-form campo-inteiro">
                  Total da compra: <strong>{formatarReais(valorCentavos * total)}</strong> ({total}×{' '}
                  {formatarReais(valorCentavos)})
                  {inicial !== null && inicial >= 1 && inicial <= total && dataValida(data) && (
                    <>
                      {' '}
                      · última parcela em{' '}
                      {formatarMesCurto(somarMeses(mesDaData(data), total - inicial))}
                    </>
                  )}
                </p>
              )}
            </>
          )}

          {escopo === 'a_partir' && editando ? (
            <div className="campo">
              <label htmlFor="dia">Dia do vencimento</label>
              <input
                id="dia"
                type="number"
                min={1}
                max={31}
                value={dia}
                onChange={(e) => setDia(e.target.value)}
              />
              <small>
                Em meses mais curtos, vale o último dia. Ex.: em {formatarMesCurto(mes)}, dia{' '}
                {dataNoMes(mes, Math.min(Math.max(Number(dia) || 1, 1), 31)).slice(8)}.
              </small>
            </div>
          ) : (
            <div className="campo">
              <label htmlFor="data">{editando ? 'Data' : rotuloData}</label>
              <input
                id="data"
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
              />
              {!editando && repeticao !== 'unico' && (
                <small>Define o mês inicial e o dia dos próximos meses.</small>
              )}
            </div>
          )}

          <div className="campo">
            <label htmlFor="categoria">Categoria</label>
            <select
              id="categoria"
              value={categoriaId}
              onChange={(e) => setCategoriaId(e.target.value)}
            >
              <option value="">Sem categoria</option>
              {categoriasVisiveis.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>

          {!reserva && (
            <>
              <div className="campo">
                <label htmlFor="forma">Forma de pagamento</label>
                <select id="forma" value={forma} onChange={(e) => setForma(e.target.value)}>
                  <option value="">Não informar</option>
                  {FORMAS_PAGAMENTO.map((f) => (
                    <option key={f} value={f}>
                      {ROTULOS_FORMA[f]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="campo">
                <label htmlFor="fatura">Fatura (opcional)</label>
                <input
                  id="fatura"
                  list="lista-faturas"
                  maxLength={80}
                  placeholder="Ex.: Cartão Nubank"
                  value={fatura}
                  onChange={(e) => setFatura(e.target.value)}
                />
                <datalist id="lista-faturas">
                  {faturas.map((f) => (
                    <option key={f} value={f} />
                  ))}
                </datalist>
                <small>Só agrupa itens. O total da fatura nunca é somado de novo.</small>
              </div>
            </>
          )}

          {tipoReserva && (
            <div className="campo campo-inteiro">
              <label htmlFor="reserva">
                {tipo === 'aporte' ? 'Consome qual reserva?' : 'Consome reserva de lazer?'}
              </label>
              <select id="reserva" value={reservaId} onChange={(e) => setReservaId(e.target.value)}>
                <option value="">
                  {tipo === 'aporte' ? 'Nenhuma (aporte extra)' : 'Nenhuma (reduz o dinheiro livre)'}
                </option>
                {reservas.map((r) => (
                  <option key={r.serieId} value={r.serieId}>
                    {r.nome} — resta {formatarReais(r.restanteCentavos)}
                  </option>
                ))}
              </select>
              {reservas.length === 0 && (
                <small>Não há reservas desse tipo em {formatarMesCurto(mesDaReserva)}.</small>
              )}
            </div>
          )}

          <div className="campo campo-inteiro">
            <label htmlFor="observacao">Observação (opcional)</label>
            <input
              id="observacao"
              maxLength={500}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
            />
          </div>

          {!editando && !reserva && (
            <label className="opcao campo-inteiro">
              <input
                type="checkbox"
                checked={jaRealizado}
                onChange={(e) => setJaRealizado(e.target.checked)}
              />
              {tipo === 'receita' ? 'Já recebi este valor' : 'Já paguei este valor'}
              {repeticao !== 'unico' && ' (apenas no primeiro mês)'}
            </label>
          )}
        </div>

        <div className="acoes-dialogo">
          <button type="button" className="botao" onClick={aoFechar}>
            Cancelar
          </button>
          <button type="submit" className="botao botao-primario" disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>

      {confirmarPerda !== null && (
        <Confirmacao
          titulo="Remover valores realizados?"
          texto={
            <p>
              Reduzir as parcelas remove {confirmarPerda} ocorrência(s) que já têm valor realizado.
              Essa ação não pode ser desfeita.
            </p>
          }
          rotuloConfirmar="Remover e salvar"
          perigoso
          aoCancelar={() => setConfirmarPerda(null)}
          aoConfirmar={() => {
            setConfirmarPerda(null)
            void salvar(true)
          }}
        />
      )}
    </Dialogo>
  )
}
