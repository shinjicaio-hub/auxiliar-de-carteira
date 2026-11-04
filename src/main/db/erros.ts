/** Erro com mensagem pronta para o usuário. */
export class ErroNegocio extends Error {
  constructor(
    mensagem: string,
    readonly codigo?: string,
    readonly quantidade?: number
  ) {
    super(mensagem)
    this.name = 'ErroNegocio'
  }
}
