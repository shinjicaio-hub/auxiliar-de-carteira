import { useEffect, useRef, type ReactNode } from 'react'
import { formatarMes, somarMeses } from '../../../shared/datas'
import { formatarReais } from '../../../shared/dinheiro'

export function Valor({ centavos, forte }: { centavos: number; forte?: boolean }) {
  const classes = ['valor', centavos < 0 ? 'negativo' : '', forte ? 'forte' : ''].filter(Boolean)
  return <span className={classes.join(' ')}>{formatarReais(centavos)}</span>
}

export function Aviso({ tipo, children }: { tipo: 'erro' | 'sucesso' | 'info'; children: ReactNode }) {
  return (
    <div className={`aviso aviso-${tipo}`} role={tipo === 'erro' ? 'alert' : 'status'}>
      {children}
    </div>
  )
}

export function Dialogo({
  titulo,
  aoFechar,
  children,
  largo
}: {
  titulo: string
  aoFechar: () => void
  children: ReactNode
  largo?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialogo = ref.current
    if (dialogo && !dialogo.open) dialogo.showModal()
  }, [])
  return (
    <dialog
      ref={ref}
      className={largo ? 'dialogo dialogo-largo' : 'dialogo'}
      aria-label={titulo}
      onCancel={(e) => {
        e.preventDefault()
        aoFechar()
      }}
    >
      <h2>{titulo}</h2>
      {children}
    </dialog>
  )
}

export function Confirmacao({
  titulo,
  texto,
  rotuloConfirmar,
  perigoso,
  aoConfirmar,
  aoCancelar
}: {
  titulo: string
  texto: ReactNode
  rotuloConfirmar: string
  perigoso?: boolean
  aoConfirmar: () => void
  aoCancelar: () => void
}) {
  return (
    <Dialogo titulo={titulo} aoFechar={aoCancelar}>
      <div className="texto-dialogo">{texto}</div>
      <div className="acoes-dialogo">
        <button type="button" className="botao" onClick={aoCancelar}>
          Cancelar
        </button>
        <button
          type="button"
          className={perigoso ? 'botao botao-perigo' : 'botao botao-primario'}
          onClick={aoConfirmar}
        >
          {rotuloConfirmar}
        </button>
      </div>
    </Dialogo>
  )
}

const NOMES_MESES = Array.from({ length: 12 }, (_, i) =>
  formatarMes(`2000-${String(i + 1).padStart(2, '0')}`).split(' ')[0]!
)

export function SeletorMes({
  mes,
  aoMudar,
  mesAtual
}: {
  mes: string
  aoMudar: (mes: string) => void
  mesAtual: string
}) {
  const ano = Number(mes.slice(0, 4))
  const numeroMes = mes.slice(5, 7)
  const anos = Array.from({ length: 21 }, (_, i) => ano - 10 + i)
  return (
    <div className="seletor-mes">
      <button
        type="button"
        className="botao botao-icone"
        aria-label="Mês anterior"
        onClick={() => aoMudar(somarMeses(mes, -1))}
      >
        ‹
      </button>
      <select
        aria-label="Mês"
        value={numeroMes}
        onChange={(e) => aoMudar(`${mes.slice(0, 4)}-${e.target.value}`)}
      >
        {NOMES_MESES.map((nome, i) => (
          <option key={nome} value={String(i + 1).padStart(2, '0')}>
            {nome}
          </option>
        ))}
      </select>
      <select
        aria-label="Ano"
        value={ano}
        onChange={(e) => aoMudar(`${e.target.value}-${numeroMes}`)}
      >
        {anos.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="botao botao-icone"
        aria-label="Próximo mês"
        onClick={() => aoMudar(somarMeses(mes, 1))}
      >
        ›
      </button>
      {mes !== mesAtual && (
        <button type="button" className="botao" onClick={() => aoMudar(mesAtual)}>
          Mês atual
        </button>
      )}
    </div>
  )
}
