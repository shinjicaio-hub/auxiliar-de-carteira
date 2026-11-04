import { useState, type FormEvent } from 'react'
import { esquemaCriarCategoria, primeiraMensagem } from '../../../shared/esquemas'
import type { Categoria } from '../../../shared/tipos'
import { chamar, mensagemDe, useDados } from '../api'
import { Aviso, Confirmacao, Dialogo } from '../componentes/Basicos'
import { lerTema, salvarTema, type Tema } from '../tema'

type Retorno = { tipo: 'erro' | 'sucesso'; texto: string } | null

function DialogoRenomear({
  categoria,
  aoFechar,
  aoSalvar
}: {
  categoria: Categoria
  aoFechar: () => void
  aoSalvar: () => void
}) {
  const [nome, setNome] = useState(categoria.nome)
  const [erro, setErro] = useState<string | null>(null)

  async function salvar(e: FormEvent) {
    e.preventDefault()
    const r = esquemaCriarCategoria.safeParse({ nome })
    if (!r.success) return setErro(primeiraMensagem(r.error))
    try {
      await chamar('renomearCategoria', { id: categoria.id, nome: r.data.nome })
      aoSalvar()
    } catch (falha) {
      setErro(mensagemDe(falha))
    }
  }

  return (
    <Dialogo titulo="Renomear categoria" aoFechar={aoFechar}>
      <form onSubmit={salvar} noValidate>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        <div className="campo">
          <label htmlFor="novo-nome">Nome</label>
          <input
            id="novo-nome"
            autoFocus
            maxLength={60}
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />
        </div>
        <div className="acoes-dialogo">
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

export function Configuracoes({
  mes,
  chave,
  aoAlterar
}: {
  mes: string
  chave: number
  aoAlterar: () => void
}) {
  const { dados, erro } = useDados(async () => {
    const [categorias, info] = await Promise.all([chamar('listarCategorias'), chamar('infoDados')])
    return { categorias, info }
  }, String(chave))

  const [novaCategoria, setNovaCategoria] = useState('')
  const [renomeando, setRenomeando] = useState<Categoria | null>(null)
  const [excluindo, setExcluindo] = useState<Categoria | null>(null)
  const [removendoDemo, setRemovendoDemo] = useState(false)
  const [retorno, setRetorno] = useState<Retorno>(null)
  const [tema, setTema] = useState<Tema>(lerTema)

  async function executar(acao: () => Promise<unknown>, sucesso?: string) {
    setRetorno(null)
    try {
      await acao()
      if (sucesso) setRetorno({ tipo: 'sucesso', texto: sucesso })
      aoAlterar()
    } catch (e) {
      setRetorno({ tipo: 'erro', texto: mensagemDe(e) })
    }
  }

  async function adicionar(e: FormEvent) {
    e.preventDefault()
    const r = esquemaCriarCategoria.safeParse({ nome: novaCategoria })
    if (!r.success) return setRetorno({ tipo: 'erro', texto: primeiraMensagem(r.error) })
    await executar(async () => {
      await chamar('criarCategoria', r.data)
      setNovaCategoria('')
    })
  }

  async function exportar() {
    setRetorno(null)
    try {
      const r = await chamar('exportarBackup')
      if (r.concluido) setRetorno({ tipo: 'sucesso', texto: `Backup salvo em ${r.caminho}` })
    } catch (e) {
      setRetorno({ tipo: 'erro', texto: mensagemDe(e) })
    }
  }

  async function restaurar() {
    setRetorno(null)
    try {
      const r = await chamar('restaurarBackup')
      if (r.concluido) {
        setRetorno({
          tipo: 'sucesso',
          texto: `Backup restaurado. Seus dados anteriores foram guardados em ${r.caminho}`
        })
        aoAlterar()
      }
    } catch (e) {
      setRetorno({ tipo: 'erro', texto: mensagemDe(e) })
    }
  }

  if (erro) return <Aviso tipo="erro">{erro}</Aviso>
  if (!dados) return null
  const { categorias, info } = dados

  return (
    <div className="pilha">
      {retorno && <Aviso tipo={retorno.tipo}>{retorno.texto}</Aviso>}

      <section className="painel">
        <h3>Categorias</h3>
        <form className="linha-form" onSubmit={adicionar} noValidate>
          <input
            aria-label="Nome da nova categoria"
            placeholder="Nova categoria"
            maxLength={60}
            value={novaCategoria}
            onChange={(e) => setNovaCategoria(e.target.value)}
          />
          <button type="submit" className="botao botao-primario">
            Adicionar
          </button>
        </form>
        <table className="tabela">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Situação</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {categorias.map((c) => (
              <tr key={c.id}>
                <td>{c.nome}</td>
                <td>{c.ativa ? 'Ativa' : 'Arquivada'}</td>
                <td>
                  <div className="acoes-linha">
                    <button
                      type="button"
                      className="botao botao-pequeno"
                      onClick={() => setRenomeando(c)}
                    >
                      Renomear
                    </button>
                    <button
                      type="button"
                      className="botao botao-pequeno"
                      onClick={() =>
                        void executar(() =>
                          chamar('definirCategoriaAtiva', { id: c.id, ativa: !c.ativa })
                        )
                      }
                    >
                      {c.ativa ? 'Arquivar' : 'Reativar'}
                    </button>
                    <button
                      type="button"
                      className="botao botao-pequeno botao-texto-perigo"
                      onClick={() => setExcluindo(c)}
                    >
                      Excluir
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="painel">
        <h3>Aparência</h3>
        <div className="campo campo-curto">
          <label htmlFor="tema">Tema</label>
          <select
            id="tema"
            value={tema}
            onChange={(e) => {
              const novo = e.target.value as Tema
              setTema(novo)
              salvarTema(novo)
            }}
          >
            <option value="sistema">Igual ao Windows</option>
            <option value="claro">Claro</option>
            <option value="escuro">Escuro</option>
          </select>
        </div>
      </section>

      <section className="painel">
        <h3>Backup</h3>
        <p>
          Salve uma cópia dos seus dados em outro lugar, como um pendrive ou uma pasta na nuvem.
          Restaurar substitui todos os dados atuais pelos do backup, depois de pedir confirmação.
        </p>
        <div className="linha-botoes">
          <button type="button" className="botao botao-primario" onClick={() => void exportar()}>
            Exportar backup
          </button>
          <button type="button" className="botao" onClick={() => void restaurar()}>
            Restaurar backup
          </button>
        </div>
        <p className="nota">Seus dados ficam em: {info.caminhoBanco}</p>
      </section>

      <section className="painel">
        <h3>Dados de demonstração</h3>
        <p>
          Exemplos para conhecer o aplicativo, com nomes iniciados por “[Demonstração]”. Eles entram
          nas contas enquanto estiverem carregados e podem ser removidos sem afetar seus dados.
        </p>
        {info.temDemonstracao ? (
          <button type="button" className="botao" onClick={() => setRemovendoDemo(true)}>
            Remover dados de demonstração
          </button>
        ) : (
          <button
            type="button"
            className="botao"
            onClick={() =>
              void executar(
                () => chamar('carregarDemonstracao', mes),
                'Dados de demonstração carregados a partir do mês selecionado.'
              )
            }
          >
            Carregar dados de demonstração
          </button>
        )}
      </section>

      {renomeando && (
        <DialogoRenomear
          categoria={renomeando}
          aoFechar={() => setRenomeando(null)}
          aoSalvar={() => {
            setRenomeando(null)
            aoAlterar()
          }}
        />
      )}
      {excluindo && (
        <Confirmacao
          titulo="Excluir categoria"
          texto={<p>Excluir a categoria “{excluindo.nome}”?</p>}
          rotuloConfirmar="Excluir"
          perigoso
          aoCancelar={() => setExcluindo(null)}
          aoConfirmar={() => {
            const { id } = excluindo
            setExcluindo(null)
            void executar(() => chamar('excluirCategoria', { id }))
          }}
        />
      )}
      {removendoDemo && (
        <Confirmacao
          titulo="Remover demonstração"
          texto={<p>Remover todos os lançamentos de demonstração? Seus dados não são afetados.</p>}
          rotuloConfirmar="Remover"
          perigoso
          aoCancelar={() => setRemovendoDemo(false)}
          aoConfirmar={() => {
            setRemovendoDemo(false)
            void executar(() => chamar('removerDemonstracao'), 'Dados de demonstração removidos.')
          }}
        />
      )}
    </div>
  )
}
