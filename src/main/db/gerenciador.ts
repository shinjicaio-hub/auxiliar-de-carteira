import { copyFileSync, mkdirSync, renameSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import Database from 'better-sqlite3'
import { ErroNegocio } from './erros'
import { abrirBanco, ID_APLICATIVO, VERSAO_ESQUEMA } from './migracoes'
import { Repositorio } from './repositorio'

const TABELAS_OBRIGATORIAS = ['categorias', 'series', 'series_versoes', 'ocorrencias']

/** Confere se o arquivo é um backup íntegro deste aplicativo, sem alterá-lo. */
export function validarBackup(caminho: string): void {
  let db: Database.Database
  try {
    db = new Database(caminho, { readonly: true, fileMustExist: true })
  } catch {
    throw new ErroNegocio('Não foi possível abrir o arquivo de backup.')
  }
  try {
    let aplicativo: unknown
    let versao: unknown
    let integridade: unknown
    let chaves: unknown[]
    let tabelas: string[]
    try {
      aplicativo = db.pragma('application_id', { simple: true })
      versao = db.pragma('user_version', { simple: true })
      integridade = db.pragma('integrity_check', { simple: true })
      chaves = db.pragma('foreign_key_check') as unknown[]
      tabelas = (
        db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as { name: string }[]
      ).map((t) => t.name)
    } catch {
      throw new ErroNegocio('Este arquivo não é um backup válido do Auxiliar de Carteira.')
    }
    if (aplicativo !== ID_APLICATIVO || !TABELAS_OBRIGATORIAS.every((t) => tabelas.includes(t))) {
      throw new ErroNegocio('Este arquivo não é um backup do Auxiliar de Carteira.')
    }
    if ((versao as number) > VERSAO_ESQUEMA) {
      throw new ErroNegocio(
        'Este backup foi criado por uma versão mais nova do aplicativo. Atualize antes de restaurar.'
      )
    }
    if (integridade !== 'ok' || chaves.length > 0) {
      throw new ErroNegocio('O arquivo de backup está danificado e não foi restaurado.')
    }
  } finally {
    db.close()
  }
}

function carimbo(): string {
  return new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15)
}

/** Dono da conexão com o banco; troca a conexão com segurança ao restaurar. */
export class GerenciadorBanco {
  private db: Database.Database
  private repositorioAtual: Repositorio

  constructor(readonly caminho: string) {
    mkdirSync(dirname(caminho), { recursive: true })
    this.db = abrirBanco(caminho)
    this.repositorioAtual = new Repositorio(this.db)
  }

  get repositorio(): Repositorio {
    return this.repositorioAtual
  }

  fechar(): void {
    this.db.close()
  }

  /** Usa a API de backup do SQLite, que gera uma cópia consistente do banco. */
  async exportarBackup(destino: string): Promise<void> {
    if (resolve(destino) === resolve(this.caminho)) {
      throw new ErroNegocio('Escolha um local diferente do banco em uso.')
    }
    await this.db.backup(destino)
    validarBackup(destino)
  }

  /**
   * Substitui os dados atuais pelo backup. Guarda antes uma cópia dos dados atuais
   * e volta para ela se algo der errado depois de trocar o arquivo.
   */
  async restaurarBackup(origem: string): Promise<string> {
    validarBackup(origem)

    const pastaSeguranca = join(dirname(this.caminho), 'copias-de-seguranca')
    mkdirSync(pastaSeguranca, { recursive: true })
    const copiaSeguranca = join(pastaSeguranca, `antes-da-restauracao-${carimbo()}.sqlite`)
    await this.db.backup(copiaSeguranca)

    const temporario = `${this.caminho}.restaurando`
    copyFileSync(origem, temporario)
    try {
      validarBackup(temporario)
    } catch (erro) {
      rmSync(temporario, { force: true })
      throw erro
    }

    this.db.close()
    try {
      renameSync(temporario, this.caminho)
      rmSync(`${this.caminho}-journal`, { force: true })
      this.db = abrirBanco(this.caminho)
    } catch (erro) {
      rmSync(temporario, { force: true })
      copyFileSync(copiaSeguranca, this.caminho)
      this.db = abrirBanco(this.caminho)
      this.repositorioAtual = new Repositorio(this.db)
      console.error('Falha ao restaurar:', erro)
      throw new ErroNegocio('Não foi possível restaurar. Seus dados anteriores foram mantidos.')
    }
    this.repositorioAtual = new Repositorio(this.db)
    return copiaSeguranca
  }
}
