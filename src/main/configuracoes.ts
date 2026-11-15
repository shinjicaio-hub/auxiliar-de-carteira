import { readFileSync, writeFileSync } from 'node:fs'

export interface Preferencias {
  atualizacaoAutomatica: boolean
}

const PADRAO: Preferencias = { atualizacaoAutomatica: true }

/** Preferências do aplicativo, num arquivo próprio ao lado do banco. */
export class Configuracoes {
  constructor(private readonly caminho: string) {}

  ler(): Preferencias {
    try {
      const salvo = JSON.parse(readFileSync(this.caminho, 'utf8')) as Partial<Preferencias>
      return {
        atualizacaoAutomatica:
          typeof salvo.atualizacaoAutomatica === 'boolean'
            ? salvo.atualizacaoAutomatica
            : PADRAO.atualizacaoAutomatica
      }
    } catch {
      return { ...PADRAO }
    }
  }

  definir(parcial: Partial<Preferencias>): void {
    writeFileSync(this.caminho, JSON.stringify({ ...this.ler(), ...parcial }, null, 2), 'utf8')
  }
}
