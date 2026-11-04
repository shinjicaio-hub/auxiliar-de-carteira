import { useCallback, useEffect, useState } from 'react'
import type { ApiCarteira, NomeOperacao, OperacoesCarteira, Resposta } from '../../shared/api'

declare global {
  interface Window {
    carteira: ApiCarteira
  }
}

export class ErroApi extends Error {
  constructor(
    mensagem: string,
    readonly codigo?: string,
    readonly quantidade?: number
  ) {
    super(mensagem)
  }
}

export async function chamar<K extends NomeOperacao>(
  operacao: K,
  ...args: Parameters<OperacoesCarteira[K]>
): Promise<ReturnType<OperacoesCarteira[K]>> {
  type Retorno = ReturnType<OperacoesCarteira[K]>
  const funcao = window.carteira[operacao] as (...a: unknown[]) => Promise<Resposta<Retorno>>
  const resposta = await funcao(...args)
  if (!resposta.ok) {
    const { mensagem, codigo, quantidade } = resposta.erro
    throw new ErroApi(mensagem, codigo, quantidade)
  }
  return resposta.dados
}

export function mensagemDe(erro: unknown): string {
  return erro instanceof Error ? erro.message : 'Algo deu errado. Tente novamente.'
}

/** Carrega dados e recarrega sempre que `chave` mudar. */
export function useDados<T>(carregar: () => Promise<T>, chave: string) {
  const [dados, setDados] = useState<T | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [versao, setVersao] = useState(0)

  useEffect(() => {
    let ativo = true
    carregar().then(
      (resultado) => {
        if (!ativo) return
        setDados(resultado)
        setErro(null)
      },
      (e: unknown) => {
        if (ativo) setErro(mensagemDe(e))
      }
    )
    return () => {
      ativo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, versao])

  const recarregar = useCallback(() => setVersao((v) => v + 1), [])
  return { dados, erro, recarregar }
}
