import { useEffect, useState, type FormEvent } from 'react'
import { dataValida, formatarMesCurto, mesDaData } from '../../../shared/datas'
import { formatarReais, reaisParaCentavos } from '../../../shared/dinheiro'
import { esquemaCriarLancamento, primeiraMensagem } from '../../../shared/esquemas'
import {
  FORMAS_PAGAMENTO,
  ROTULOS_FORMA,
  type Categoria,
  type FormaPagamento,
  type UsoReserva
} from '../../../shared/tipos'
import { chamar, mensagemDe } from '../api'
import { Aviso, Dialogo } from './Basicos'

/** Atalho para o caso mais comum: anotar um gasto que acabou de acontecer. */
export function FormRapido({
  mes,
  hoje,
  reservaInicial,
  aoFechar,
  aoSalvar
}: {
  mes: string
  hoje: string
  reservaInicial?: number
  aoFechar: () => void
  aoSalvar: () => void
}) {
  const [valor, setValor] = useState('')
  const [nome, setNome] = useState('')
  const [data, setData] = useState(mesDaData(hoje) === mes ? hoje : `${mes}-01`)
  const [categoriaId, setCategoriaId] = useState('')
  const [forma, setForma] = useState('')
  const [reservaId, setReservaId] = useState(String(reservaInicial ?? ''))
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [reservas, setReservas] = useState<UsoReserva[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const mesDoGasto = dataValida(data) ? mesDaData(data) : mes

  useEffect(() => {
    chamar('listarCategorias').then(setCategorias, (e: unknown) => setErro(mensagemDe(e)))
  }, [])

  useEffect(() => {
    let ativo = true
    chamar('resumoMes', mesDoGasto).then(
      (r) => {
        if (ativo) setReservas(r.reservas.filter((x) => x.tipo === 'lazer'))
      },
      () => {
        if (ativo) setReservas([])
      }
    )
    return () => {
      ativo = false
    }
  }, [mesDoGasto])

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    const valorCentavos = reaisParaCentavos(valor)
    if (valorCentavos === null) return setErro('Informe o valor em reais, por exemplo 45,90.')

    const r = esquemaCriarLancamento.safeParse({
      tipo: 'gasto_livre',
      repeticao: 'unico',
      nome,
      valorCentavos,
      data,
      categoriaId: categoriaId ? Number(categoriaId) : null,
      formaPagamento: (forma || null) as FormaPagamento | null,
      fatura: null,
      reservaSerieId: reservaId ? Number(reservaId) : null,
      observacao: null,
      parcelaInicial: null,
      parcelasTotal: null,
      jaRealizado: true
    })
    if (!r.success) return setErro(primeiraMensagem(r.error))

    setSalvando(true)
    try {
      await chamar('criarLancamento', r.data)
      aoSalvar()
    } catch (falha) {
      setErro(mensagemDe(falha))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialogo titulo="Registrar gasto" aoFechar={aoFechar}>
      <form onSubmit={salvar} noValidate>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        <div className="grade-form">
          <div className="campo">
            <label htmlFor="rapido-valor">Valor (R$)</label>
            <input
              id="rapido-valor"
              inputMode="decimal"
              placeholder="0,00"
              autoFocus
              value={valor}
              onChange={(e) => setValor(e.target.value)}
            />
          </div>
          <div className="campo">
            <label htmlFor="rapido-data">Data</label>
            <input
              id="rapido-data"
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
            />
          </div>
          <div className="campo campo-inteiro">
            <label htmlFor="rapido-nome">Com o quê?</label>
            <input
              id="rapido-nome"
              maxLength={120}
              placeholder="Ex.: Almoço, Uber, Farmácia"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
          </div>
          <div className="campo">
            <label htmlFor="rapido-categoria">Categoria</label>
            <select
              id="rapido-categoria"
              value={categoriaId}
              onChange={(e) => setCategoriaId(e.target.value)}
            >
              <option value="">Sem categoria</option>
              {categorias
                .filter((c) => c.ativa)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="rapido-forma">Pagamento</label>
            <select id="rapido-forma" value={forma} onChange={(e) => setForma(e.target.value)}>
              <option value="">Não informar</option>
              {FORMAS_PAGAMENTO.map((f) => (
                <option key={f} value={f}>
                  {ROTULOS_FORMA[f]}
                </option>
              ))}
            </select>
          </div>
          {reservas.length > 0 && (
            <div className="campo campo-inteiro">
              <label htmlFor="rapido-reserva">Sai de uma reserva de lazer?</label>
              <select
                id="rapido-reserva"
                value={reservaId}
                onChange={(e) => setReservaId(e.target.value)}
              >
                <option value="">Não, sai do dinheiro livre</option>
                {reservas.map((r) => (
                  <option key={r.serieId} value={r.serieId}>
                    {r.nome} — resta {formatarReais(r.restanteCentavos)}
                  </option>
                ))}
              </select>
              <small>Reservas de {formatarMesCurto(mesDoGasto)}.</small>
            </div>
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
    </Dialogo>
  )
}
