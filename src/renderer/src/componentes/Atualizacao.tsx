import { useCallback, useEffect, useState } from 'react'
import type { EstadoAtualizacao, InfoAtualizacao } from '../../../shared/api'
import { chamar, mensagemDe } from '../api'
import { Aviso } from './Basicos'
import { Medidor } from './Graficos'

/** Estado da atualização, sempre em sincronia com o processo principal. */
export function useAtualizacao() {
  const [info, setInfo] = useState<InfoAtualizacao | null>(null)

  useEffect(() => {
    let ativo = true
    chamar('infoAtualizacao').then(
      (dados) => {
        if (ativo) setInfo(dados)
      },
      () => undefined
    )
    const parar = window.carteira.aoMudarAtualizacao((estado) =>
      setInfo((atual) => (atual ? { ...atual, estado } : atual))
    )
    return () => {
      ativo = false
      parar()
    }
  }, [])

  const recarregar = useCallback(() => {
    chamar('infoAtualizacao').then(setInfo, () => undefined)
  }, [])

  return { info, recarregar }
}

/** Faixa no topo que aparece só quando há algo a fazer. */
export function FaixaAtualizacao() {
  const { info } = useAtualizacao()
  const [dispensada, setDispensada] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const estado = info?.estado

  if (!estado || !('versao' in estado)) return null
  const chave = `${estado.fase}-${estado.versao}`
  if (dispensada === chave) return null

  async function agir(operacao: 'baixarAtualizacao' | 'instalarAtualizacao') {
    setErro(null)
    try {
      await chamar(operacao)
    } catch (e) {
      setErro(mensagemDe(e))
    }
  }

  return (
    <div className="faixa-atualizacao" role="status" data-testid="faixa-atualizacao">
      {estado.fase === 'disponivel' && (
        <>
          <p>
            <strong>Nova versão {estado.versao} disponível.</strong> Seus dados continuam onde estão.
          </p>
          <div className="linha-botoes">
            <button type="button" className="botao" onClick={() => setDispensada(chave)}>
              Agora não
            </button>
            <button
              type="button"
              className="botao botao-primario"
              onClick={() => void agir('baixarAtualizacao')}
            >
              Atualizar
            </button>
          </div>
        </>
      )}
      {estado.fase === 'baixando' && (
        <div className="faixa-progresso">
          <p>
            Baixando a versão {estado.versao}… {estado.percentual}%
          </p>
          <Medidor usado={estado.percentual} limite={100} rotulo="Progresso do download" />
        </div>
      )}
      {estado.fase === 'pronta' && (
        <>
          <p>
            <strong>Versão {estado.versao} pronta.</strong> O aplicativo faz um backup, fecha,
            instala e abre de novo.
          </p>
          <div className="linha-botoes">
            <button type="button" className="botao" onClick={() => setDispensada(chave)}>
              Depois
            </button>
            <button
              type="button"
              className="botao botao-primario"
              onClick={() => void agir('instalarAtualizacao')}
            >
              Reiniciar e atualizar
            </button>
          </div>
        </>
      )}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
    </div>
  )
}

function descrever(estado: EstadoAtualizacao): string {
  switch (estado.fase) {
    case 'indisponivel':
      return 'Atualizações funcionam apenas no aplicativo instalado.'
    case 'parada':
      return 'Ainda não procurou atualizações nesta sessão.'
    case 'verificando':
      return 'Procurando atualizações…'
    case 'atualizado':
      return 'Você está na versão mais recente.'
    case 'disponivel':
      return `Versão ${estado.versao} disponível.`
    case 'baixando':
      return `Baixando a versão ${estado.versao}: ${estado.percentual}%.`
    case 'pronta':
      return `Versão ${estado.versao} baixada e pronta para instalar.`
    case 'erro':
      return estado.mensagem
  }
}

/** Seção de Configurações: versão atual, preferência e verificação manual. */
export function SecaoAtualizacao() {
  const { info, recarregar } = useAtualizacao()
  const [erro, setErro] = useState<string | null>(null)
  if (!info) return null
  const indisponivel = info.estado.fase === 'indisponivel'
  const ocupado = ['verificando', 'baixando'].includes(info.estado.fase)

  async function executar(acao: () => Promise<unknown>) {
    setErro(null)
    try {
      await acao()
      recarregar()
    } catch (e) {
      setErro(mensagemDe(e))
    }
  }

  return (
    <section className="painel">
      <h3>Atualizações</h3>
      <p>
        Versão instalada: <strong>{info.versaoAtual}</strong>
      </p>
      <p className="nota" data-testid="estado-atualizacao">
        {descrever(info.estado)}
      </p>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {!indisponivel && (
        <>
          <label className="opcao margem-form">
            <input
              type="checkbox"
              checked={info.automatica}
              onChange={(e) => {
                const ativa = e.target.checked
                void executar(() => chamar('definirAtualizacaoAutomatica', { ativa }))
              }}
            />
            Procurar atualizações ao abrir o aplicativo
          </label>
          <div className="linha-botoes margem-form">
            <button
              type="button"
              className="botao"
              disabled={ocupado}
              onClick={() => void executar(() => chamar('verificarAtualizacao'))}
            >
              Procurar agora
            </button>
          </div>
          <p className="nota">
            A consulta usa a internet só para ver se há versão nova. Seus dados nunca saem do
            computador, e um backup é feito antes de cada atualização.
          </p>
        </>
      )}
    </section>
  )
}
