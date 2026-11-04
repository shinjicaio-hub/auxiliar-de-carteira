import { copyFileSync, existsSync } from 'node:fs'
import Database from 'better-sqlite3'
import { ErroNegocio } from './erros'

/** Identifica o arquivo como banco deste aplicativo ("CART" em hexadecimal). */
export const ID_APLICATIVO = 0x43415254

const TIPOS_SQL = `'receita','compromisso','investimento','lazer','gasto_livre','aporte'`
const FORMATO_MES = `'[0-9][0-9][0-9][0-9]-[0-9][0-9]'`
const FORMATO_DATA = `'[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`

/**
 * Cada migração roda uma única vez, em ordem. Nunca altere uma migração já
 * publicada: acrescente outra ao final da lista.
 */
const MIGRACOES: string[] = [
  `
  CREATE TABLE categorias (
    id INTEGER PRIMARY KEY,
    nome TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(trim(nome)) > 0),
    ativa INTEGER NOT NULL DEFAULT 1 CHECK (ativa IN (0, 1))
  );

  CREATE TABLE series (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT NOT NULL CHECK (tipo IN (${TIPOS_SQL})),
    repeticao TEXT NOT NULL CHECK (repeticao IN ('unico', 'parcelado', 'recorrente')),
    mes_inicial TEXT NOT NULL CHECK (mes_inicial GLOB ${FORMATO_MES}),
    parcela_inicial INTEGER,
    parcelas_total INTEGER,
    mes_encerramento TEXT CHECK (mes_encerramento IS NULL OR mes_encerramento GLOB ${FORMATO_MES}),
    demo INTEGER NOT NULL DEFAULT 0 CHECK (demo IN (0, 1)),
    CHECK (
      (repeticao = 'parcelado' AND parcelas_total >= 1
        AND parcela_inicial BETWEEN 1 AND parcelas_total)
      OR (repeticao <> 'parcelado' AND parcelas_total IS NULL AND parcela_inicial IS NULL)
    )
  );

  CREATE TABLE series_versoes (
    serie_id INTEGER NOT NULL REFERENCES series (id) ON DELETE CASCADE,
    a_partir_de TEXT NOT NULL CHECK (a_partir_de GLOB ${FORMATO_MES}),
    nome TEXT NOT NULL CHECK (length(trim(nome)) > 0),
    valor_centavos INTEGER NOT NULL CHECK (typeof(valor_centavos) = 'integer' AND valor_centavos > 0),
    dia INTEGER NOT NULL CHECK (dia BETWEEN 1 AND 31),
    categoria_id INTEGER REFERENCES categorias (id) ON DELETE RESTRICT,
    forma_pagamento TEXT,
    fatura TEXT,
    reserva_serie_id INTEGER REFERENCES series (id) ON DELETE SET NULL,
    observacao TEXT,
    PRIMARY KEY (serie_id, a_partir_de)
  );

  CREATE TABLE ocorrencias (
    serie_id INTEGER NOT NULL REFERENCES series (id) ON DELETE CASCADE,
    mes TEXT NOT NULL CHECK (mes GLOB ${FORMATO_MES}),
    excluida INTEGER NOT NULL DEFAULT 0 CHECK (excluida IN (0, 1)),
    editada INTEGER NOT NULL DEFAULT 0 CHECK (editada IN (0, 1)),
    nome TEXT,
    valor_centavos INTEGER CHECK (valor_centavos IS NULL OR (typeof(valor_centavos) = 'integer' AND valor_centavos > 0)),
    data TEXT CHECK (data IS NULL OR data GLOB ${FORMATO_DATA}),
    categoria_id INTEGER REFERENCES categorias (id) ON DELETE RESTRICT,
    forma_pagamento TEXT,
    fatura TEXT,
    reserva_serie_id INTEGER REFERENCES series (id) ON DELETE SET NULL,
    observacao TEXT,
    realizado_centavos INTEGER CHECK (realizado_centavos IS NULL OR (typeof(realizado_centavos) = 'integer' AND realizado_centavos >= 0)),
    data_realizacao TEXT CHECK (data_realizacao IS NULL OR data_realizacao GLOB ${FORMATO_DATA}),
    PRIMARY KEY (serie_id, mes),
    CHECK (editada = 0 OR (nome IS NOT NULL AND valor_centavos IS NOT NULL AND data IS NOT NULL))
  );

  CREATE INDEX idx_versoes_categoria ON series_versoes (categoria_id);
  CREATE INDEX idx_ocorrencias_categoria ON ocorrencias (categoria_id);

  INSERT INTO categorias (nome) VALUES
    ('Alimentação'), ('Assinaturas'), ('Educação'), ('Investimentos'), ('Lazer'),
    ('Moradia'), ('Outros'), ('Salário'), ('Saúde'), ('Transporte');
  `,
  // OR IGNORE: mantém categorias de mesmo nome que o usuário já tenha criado.
  `
  INSERT OR IGNORE INTO categorias (nome) VALUES
    ('Água'), ('Cartão de crédito'), ('Conta de luz'), ('Gás'), ('Internet'), ('Telefone');
  `
]

export const VERSAO_ESQUEMA = MIGRACOES.length

/** Aplica o que falta, cada migração em uma transação. */
export function migrar(db: Database.Database): void {
  const atual = db.pragma('user_version', { simple: true }) as number
  if (atual > VERSAO_ESQUEMA) {
    throw new ErroNegocio(
      'Estes dados foram criados por uma versão mais nova do aplicativo. Atualize o Auxiliar de Carteira.'
    )
  }
  for (let versao = atual; versao < VERSAO_ESQUEMA; versao++) {
    db.transaction(() => {
      db.exec(MIGRACOES[versao]!)
      db.pragma(`user_version = ${versao + 1}`)
      db.pragma(`application_id = ${ID_APLICATIVO}`)
    })()
  }
}

/** Abre o banco, guardando uma cópia antes de atualizar a estrutura de dados existentes. */
export function abrirBanco(caminho: string): Database.Database {
  const jaExistia = existsSync(caminho)
  const db = new Database(caminho)
  try {
    // Modo sem arquivos auxiliares permanentes: o banco é sempre um único arquivo.
    db.pragma('journal_mode = DELETE')
    db.pragma('synchronous = FULL')
    db.pragma('foreign_keys = ON')

    const versao = db.pragma('user_version', { simple: true }) as number
    if (jaExistia && versao > 0 && versao < VERSAO_ESQUEMA) {
      copyFileSync(caminho, `${caminho}.antes-da-v${VERSAO_ESQUEMA}`)
    }
    migrar(db)
    return db
  } catch (erro) {
    db.close()
    throw erro
  }
}
