import { useState, type ReactNode } from 'react'
import { hojeLocal, mesDaData } from '../../shared/datas'
import { SeletorMes } from './componentes/Basicos'
import { FormRapido } from './componentes/FormRapido'
import {
  IconeAjustes,
  IconeFixos,
  IconeLista,
  IconeMais,
  IconePlanejar,
  IconeResumo
} from './componentes/Icones'
import { Configuracoes } from './paginas/Configuracoes'
import { Fixos } from './paginas/Fixos'
import { Lancamentos } from './paginas/Lancamentos'
import { Planejar } from './paginas/Planejar'
import { Resumo } from './paginas/Resumo'

type Area = 'resumo' | 'planejar' | 'fixos' | 'lancamentos' | 'configuracoes'

const AREAS: { id: Area; rotulo: string; icone: ReactNode }[] = [
  { id: 'resumo', rotulo: 'Resumo mensal', icone: <IconeResumo /> },
  { id: 'planejar', rotulo: 'Planejar', icone: <IconePlanejar /> },
  { id: 'fixos', rotulo: 'Renda e despesas fixas', icone: <IconeFixos /> },
  { id: 'lancamentos', rotulo: 'Lançamentos', icone: <IconeLista /> },
  { id: 'configuracoes', rotulo: 'Configurações', icone: <IconeAjustes /> }
]

export function App() {
  const hoje = hojeLocal()
  const mesAtual = mesDaData(hoje)
  const [area, setArea] = useState<Area>('resumo')
  const [mes, setMes] = useState(mesAtual)
  const [chave, setChave] = useState(0)
  const [registrando, setRegistrando] = useState(false)
  const aoAlterar = () => setChave((c) => c + 1)
  const titulo = AREAS.find((a) => a.id === area)!.rotulo

  return (
    <div className="aplicativo">
      <nav className="lateral" aria-label="Áreas do aplicativo">
        <p className="marca">
          <span className="marca-simbolo" aria-hidden="true" />
          Auxiliar de Carteira
        </p>
        <button
          type="button"
          className="botao botao-primario botao-registrar"
          onClick={() => setRegistrando(true)}
        >
          <IconeMais />
          Registrar gasto
        </button>
        {AREAS.map((a) => (
          <button
            key={a.id}
            type="button"
            className={a.id === area ? 'item-nav ativo' : 'item-nav'}
            aria-current={a.id === area ? 'page' : undefined}
            onClick={() => setArea(a.id)}
          >
            {a.icone}
            {a.rotulo}
          </button>
        ))}
      </nav>
      <main className="conteudo">
        <header className="topo">
          <h1>{titulo}</h1>
          {area !== 'configuracoes' && (
            <SeletorMes mes={mes} aoMudar={setMes} mesAtual={mesAtual} />
          )}
        </header>
        {area === 'resumo' && (
          <Resumo
            mes={mes}
            hoje={hoje}
            mesAtual={mesAtual}
            chave={chave}
            aoAlterar={aoAlterar}
            aoComecar={() => setArea('fixos')}
            aoAbrirLancamentos={() => setArea('lancamentos')}
          />
        )}
        {area === 'planejar' && (
          <Planejar mes={mes} hoje={hoje} chave={chave} aoAlterar={aoAlterar} />
        )}
        {area === 'fixos' && <Fixos mes={mes} hoje={hoje} chave={chave} aoAlterar={aoAlterar} />}
        {area === 'lancamentos' && (
          <Lancamentos mes={mes} hoje={hoje} chave={chave} aoAlterar={aoAlterar} />
        )}
        {area === 'configuracoes' && <Configuracoes mes={mes} chave={chave} aoAlterar={aoAlterar} />}
      </main>
      {registrando && (
        <FormRapido
          mes={mes}
          hoje={hoje}
          aoFechar={() => setRegistrando(false)}
          aoSalvar={() => {
            setRegistrando(false)
            aoAlterar()
          }}
        />
      )}
    </div>
  )
}
