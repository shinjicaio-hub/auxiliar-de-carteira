import { useState, type FormEvent } from 'react'
import { CODIGO_REALIZADAS_FUTURAS } from '../../../shared/api'
import { formatarMesCurto, somarMeses } from '../../../shared/datas'
import { centavosParaCampo, formatarReais, reaisParaCentavos } from '../../../shared/dinheiro'
import { esquemaRegistrarRealizado, primeiraMensagem } from '../../../shared/esquemas'
import type { Ocorrencia } from '../../../shared/tipos'
import { chamar, ErroApi, mensagemDe } from '../api'
import { Aviso, Confirmacao, Dialogo } from './Basicos'

interface Props {
  ocorrencia: Ocorrencia
  aoFechar: () => void
  aoSalvar: () => void
}

export function DialogoRealizado({ ocorrencia, aoFechar, aoSalvar }: Props) {
  const [valor, setValor] = useState(
    centavosParaCampo(ocorrencia.realizadoCentavos ?? ocorrencia.previstoCentavos)
  )
  const [data, setData] = useState(ocorrencia.dataRealizacao ?? ocorrencia.data)
  const [erro, setErro] = useState<string | null>(null)
  const receita = ocorrencia.tipo === 'receita'

  async function enviar(realizadoCentavos: number | null, dataRealizacao: string | null) {
    const r = esquemaRegistrarRealizado.safeParse({
      serieId: ocorrencia.serieId,
      mes: ocorrencia.mes,
      realizadoCentavos,
      dataRealizacao
    })
    if (!r.success) return setErro(primeiraMensagem(r.error))
    try {
      await chamar('registrarRealizado', r.data)
      aoSalvar()
    } catch (e) {
      setErro(mensagemDe(e))
    }
  }

  function aoEnviar(e: FormEvent) {
    e.preventDefault()
    const centavos = reaisParaCentavos(valor)
    if (centavos === null) return setErro('Informe o valor em reais, por exemplo 1.234,56.')
    void enviar(centavos, data)
  }

  return (
    <Dialogo titulo={receita ? 'Registrar recebimento' : 'Registrar pagamento'} aoFechar={aoFechar}>
      <form onSubmit={aoEnviar} noValidate>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        <p className="texto-dialogo">
          <strong>{ocorrencia.nome}</strong> — previsto{' '}
          {formatarReais(ocorrencia.previstoCentavos)}. O valor realizado substitui a previsão deste
          mês.
        </p>
        <div className="grade-form">
          <div className="campo">
            <label htmlFor="valor-realizado">{receita ? 'Valor recebido (R$)' : 'Valor pago (R$)'}</label>
            <input
              id="valor-realizado"
              inputMode="decimal"
              autoFocus
              value={valor}
              onChange={(e) => setValor(e.target.value)}
            />
          </div>
          <div className="campo">
            <label htmlFor="data-realizada">Data</label>
            <input
              id="data-realizada"
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
            />
          </div>
        </div>
        <div className="acoes-dialogo">
          {ocorrencia.realizadoCentavos !== null && (
            <button
              type="button"
              className="botao acao-esquerda"
              onClick={() => void enviar(null, null)}
            >
              Voltar para previsto
            </button>
          )}
          <button type="button" className="botao" onClick={aoFechar}>
            Cancelar
          </button>
          <button type="submit" className="botao botao-primario">
            Salvar
          </button>
        </div>
      </form>
    </Dialogo>
  )
}

export function DialogoExcluir({ ocorrencia, aoFechar, aoSalvar }: Props) {
  const unico = ocorrencia.repeticao === 'unico'
  const [escopo, setEscopo] = useState<'esta' | 'esta_e_futuras'>('esta')
  const [erro, setErro] = useState<string | null>(null)
  const [pendentes, setPendentes] = useState<number | null>(null)
  const mesCurto = formatarMesCurto(ocorrencia.mes)
  const primeiroMes = ocorrencia.mes === ocorrencia.mesInicial

  async function excluir(confirmarRealizadas: boolean) {
    setErro(null)
    try {
      await chamar('excluirOcorrencia', {
        serieId: ocorrencia.serieId,
        mes: ocorrencia.mes,
        escopo,
        confirmarRealizadas
      })
      aoSalvar()
    } catch (e) {
      if (e instanceof ErroApi && e.codigo === CODIGO_REALIZADAS_FUTURAS) {
        setPendentes(e.quantidade ?? 1)
      } else {
        setErro(mensagemDe(e))
      }
    }
  }

  return (
    <Dialogo titulo="Excluir lançamento" aoFechar={aoFechar}>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {unico ? (
        <p className="texto-dialogo">
          Excluir <strong>{ocorrencia.nome}</strong>? Essa ação não pode ser desfeita.
        </p>
      ) : (
        <fieldset className="grupo-escopo">
          <legend>
            O que excluir de <strong>{ocorrencia.nome}</strong>?
          </legend>
          <label className="opcao">
            <input
              type="radio"
              name="escopo-excluir"
              checked={escopo === 'esta'}
              onChange={() => setEscopo('esta')}
            />
            Só esta ocorrência ({mesCurto})
          </label>
          <label className="opcao">
            <input
              type="radio"
              name="escopo-excluir"
              checked={escopo === 'esta_e_futuras'}
              onChange={() => setEscopo('esta_e_futuras')}
            />
            Esta e as futuras
          </label>
          {escopo === 'esta_e_futuras' && (
            <small>
              {primeiroMes
                ? 'Este é o primeiro mês, então o lançamento inteiro será excluído.'
                : `Os meses até ${formatarMesCurto(somarMeses(ocorrencia.mes, -1))} ficam preservados.`}
            </small>
          )}
        </fieldset>
      )}
      <div className="acoes-dialogo">
        <button type="button" className="botao" onClick={aoFechar}>
          Cancelar
        </button>
        <button type="button" className="botao botao-perigo" onClick={() => void excluir(false)}>
          Excluir
        </button>
      </div>
      {pendentes !== null && (
        <Confirmacao
          titulo="Remover valores realizados?"
          texto={
            <p>
              {pendentes} ocorrência(s) a partir de {mesCurto} já têm valor realizado e também serão
              removidas. Essa ação não pode ser desfeita.
            </p>
          }
          rotuloConfirmar="Excluir mesmo assim"
          perigoso
          aoCancelar={() => setPendentes(null)}
          aoConfirmar={() => {
            setPendentes(null)
            void excluir(true)
          }}
        />
      )}
    </Dialogo>
  )
}

export function DialogoEncerrar({ ocorrencia, aoFechar, aoSalvar }: Props) {
  const [ultimoMes, setUltimoMes] = useState(ocorrencia.mes)
  const [erro, setErro] = useState<string | null>(null)
  const [pendentes, setPendentes] = useState<number | null>(null)
  const parcelado = ocorrencia.repeticao === 'parcelado'

  async function encerrar(confirmarRealizadas: boolean) {
    setErro(null)
    try {
      await chamar('encerrarSerie', {
        serieId: ocorrencia.serieId,
        ultimoMes,
        confirmarRealizadas
      })
      aoSalvar()
    } catch (e) {
      if (e instanceof ErroApi && e.codigo === CODIGO_REALIZADAS_FUTURAS) {
        setPendentes(e.quantidade ?? 1)
      } else {
        setErro(mensagemDe(e))
      }
    }
  }

  return (
    <Dialogo titulo={parcelado ? 'Terminar parcelamento' : 'Encerrar recorrência'} aoFechar={aoFechar}>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <p className="texto-dialogo">
        <strong>{ocorrencia.nome}</strong> deixa de aparecer depois do mês escolhido. O histórico até
        esse mês é preservado.
      </p>
      <div className="campo campo-curto">
        <label htmlFor="ultimo-mes">Último mês</label>
        <input
          id="ultimo-mes"
          type="month"
          value={ultimoMes}
          min={ocorrencia.mesInicial}
          max={ocorrencia.ultimoMes ?? undefined}
          onChange={(e) => setUltimoMes(e.target.value)}
        />
      </div>
      <div className="acoes-dialogo">
        <button type="button" className="botao" onClick={aoFechar}>
          Cancelar
        </button>
        <button type="button" className="botao botao-primario" onClick={() => void encerrar(false)}>
          {parcelado ? 'Terminar' : 'Encerrar'}
        </button>
      </div>
      {pendentes !== null && (
        <Confirmacao
          titulo="Remover valores realizados?"
          texto={
            <p>
              {pendentes} ocorrência(s) depois de {formatarMesCurto(ultimoMes)} já têm valor
              realizado e serão removidas. Essa ação não pode ser desfeita.
            </p>
          }
          rotuloConfirmar="Encerrar mesmo assim"
          perigoso
          aoCancelar={() => setPendentes(null)}
          aoConfirmar={() => {
            setPendentes(null)
            void encerrar(true)
          }}
        />
      )}
    </Dialogo>
  )
}
