import { useEffect, useRef, useState, type ReactNode } from 'react'
import { formatarMes, formatarMesEixo } from '../../../shared/datas'
import { formatarReais } from '../../../shared/dinheiro'

export interface Serie {
  id: string
  rotulo: string
  cor: string
  forma: 'barra' | 'linha'
}

export function Legenda({ series }: { series: Pick<Serie, 'id' | 'rotulo' | 'cor' | 'forma'>[] }) {
  return (
    <ul className="legenda">
      {series.map((s) => (
        <li key={s.id}>
          <span
            className={s.forma === 'linha' ? 'chave chave-linha' : 'chave'}
            style={{ background: s.cor }}
          />
          {s.rotulo}
        </li>
      ))}
    </ul>
  )
}

/** Tabela equivalente ao gráfico: nenhum valor depende de passar o mouse. */
export function VerComoTabela({ children }: { children: ReactNode }) {
  return (
    <details className="ver-tabela">
      <summary>Ver como tabela</summary>
      {children}
    </details>
  )
}

export interface ParteBarra {
  id: string
  rotulo: string
  centavos: number
  cor: string
  corTexto: string
}

/** Barra segmentada alta: uma visão de como um todo se divide. */
export function BarraSegmentada({ partes, rotulo }: { partes: ParteBarra[]; rotulo: string }) {
  const [ativa, setAtiva] = useState<string | null>(null)
  const visiveis = partes.filter((p) => p.centavos > 0)
  const total = visiveis.reduce((t, p) => t + p.centavos, 0)
  const parte = visiveis.find((p) => p.id === ativa)
  const fatia = (centavos: number) => (total > 0 ? Math.round((centavos / total) * 100) : 0)

  return (
    <div>
      <div className="barra-segmentada" role="img" aria-label={rotulo}>
        {visiveis.map((p) => {
          const porcentagem = fatia(p.centavos)
          return (
            <div
              key={p.id}
              className="segmento"
              tabIndex={0}
              aria-label={`${p.rotulo}: ${formatarReais(p.centavos)}, ${porcentagem}%`}
              style={{
                flexGrow: p.centavos,
                background: p.cor,
                color: p.corTexto
              }}
              onPointerEnter={() => setAtiva(p.id)}
              onPointerLeave={() => setAtiva(null)}
              onFocus={() => setAtiva(p.id)}
              onBlur={() => setAtiva(null)}
            >
              {porcentagem >= 7 ? `${porcentagem}%` : ''}
            </div>
          )
        })}
      </div>
      <div className="leitura-segmento" aria-live="polite">
        {parte ? (
          <>
            <strong>{formatarReais(parte.centavos)}</strong> {parte.rotulo} ({fatia(parte.centavos)}%)
          </>
        ) : (
          ' '
        )}
      </div>
      <Legenda series={visiveis.map((p) => ({ ...p, forma: 'barra' as const }))} />
    </div>
  )
}

/** Medidor de um valor contra um limite; o texto ao lado sempre informa o estado. */
export function Medidor({ usado, limite, rotulo }: { usado: number; limite: number; rotulo: string }) {
  const proporcao = limite > 0 ? usado / limite : usado > 0 ? 1 : 0
  const estado = proporcao >= 1 ? 'critico' : proporcao >= 0.8 ? 'atencao' : 'normal'
  return (
    <div
      className={`medidor medidor-${estado}`}
      role="meter"
      aria-label={rotulo}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.min(Math.round(proporcao * 100), 100)}
    >
      <div style={{ width: `${Math.min(proporcao, 1) * 100}%` }} />
    </div>
  )
}

function formatarEixo(centavos: number): string {
  const reais = centavos / 100
  if (Math.abs(reais) >= 10000) {
    return `${(reais / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`
  }
  return reais.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
}

function escalaLimpa(minimo: number, maximo: number): { passo: number; marcas: number[] } {
  const amplitude = maximo - minimo || 100000
  const bruto = amplitude / 4
  const magnitude = 10 ** Math.floor(Math.log10(bruto))
  const passo = [1, 2, 5, 10].find((m) => m * magnitude >= bruto)! * magnitude
  const marcas: number[] = []
  for (let v = Math.floor(minimo / passo) * passo; v < maximo + passo; v += passo) marcas.push(v)
  return { passo, marcas }
}

function caminhoBarra(x: number, l: number, topo: number, base: number, arredondar: boolean): string {
  const altura = Math.abs(base - topo)
  const r = arredondar ? Math.min(4, l / 2, altura) : 0
  if (topo <= base) {
    return `M${x},${base}V${topo + r}Q${x},${topo} ${x + r},${topo}H${x + l - r}Q${x + l},${topo} ${x + l},${topo + r}V${base}Z`
  }
  return `M${x},${base}V${topo - r}Q${x},${topo} ${x + r},${topo}H${x + l - r}Q${x + l},${topo} ${x + l},${topo - r}V${base}Z`
}

export interface MesGrafico {
  mes: string
  /** Cada coluna é uma pilha; em colunas lado a lado, cada uma tem um segmento. */
  colunas: { serieId: string; centavos: number }[][]
  linha?: number
}

const MARGEM = { esquerda: 54, direita: 10, topo: 22, base: 28 }

/**
 * Colunas por mês com eixo único. Serve tanto às pilhas do histórico quanto à
 * comparação antes e depois do simulador.
 */
export function GraficoMeses({
  meses,
  series,
  mesAtual,
  altura = 260,
  rotulo
}: {
  meses: MesGrafico[]
  series: Serie[]
  /** Marca a fronteira entre o que já passou e o que é previsão. */
  mesAtual?: string
  altura?: number
  rotulo: string
}) {
  const caixa = useRef<HTMLDivElement>(null)
  const [largura, setLargura] = useState(720)
  const [ativo, setAtivo] = useState<number | null>(null)

  useEffect(() => {
    const elemento = caixa.current
    if (!elemento) return
    const observador = new ResizeObserver(([entrada]) => {
      if (entrada) setLargura(entrada.contentRect.width)
    })
    observador.observe(elemento)
    return () => observador.disconnect()
  }, [])

  const porId = new Map(series.map((s) => [s.id, s]))
  const serieLinha = series.find((s) => s.forma === 'linha')

  const topos = meses.flatMap((m) => [
    ...m.colunas.map((c) => c.reduce((t, s) => t + Math.max(s.centavos, 0), 0)),
    m.linha ?? 0
  ])
  const fundos = meses.flatMap((m) => m.colunas.map((c) => c.reduce((t, s) => t + Math.min(s.centavos, 0), 0)))
  const { marcas } = escalaLimpa(Math.min(0, ...fundos), Math.max(0, ...topos))
  const minimo = marcas[0]!
  const maximo = marcas[marcas.length - 1]!

  const areaAltura = altura - MARGEM.topo - MARGEM.base
  const areaLargura = Math.max(largura - MARGEM.esquerda - MARGEM.direita, 60)
  const faixa = areaLargura / meses.length
  const y = (valor: number) =>
    MARGEM.topo + areaAltura - ((valor - minimo) / (maximo - minimo)) * areaAltura
  const centro = (i: number) => MARGEM.esquerda + faixa * i + faixa / 2
  const indiceAtual = mesAtual ? meses.findIndex((m) => m.mes === mesAtual) : -1
  const temFuturo = indiceAtual >= 0 && indiceAtual < meses.length - 1

  const detalhe = ativo === null ? null : meses[ativo]

  return (
    <div className="grafico" ref={caixa}>
      <svg width={largura} height={altura} role="img" aria-label={rotulo}>
        {marcas.map((m) => (
          <g key={m}>
            <line
              className={m === 0 ? 'eixo' : 'grade'}
              x1={MARGEM.esquerda}
              x2={largura - MARGEM.direita}
              y1={y(m)}
              y2={y(m)}
            />
            <text className="rotulo-eixo" x={MARGEM.esquerda - 8} y={y(m) + 4} textAnchor="end">
              {formatarEixo(m)}
            </text>
          </g>
        ))}

        {temFuturo && (
          <g>
            <line
              className="eixo"
              x1={MARGEM.esquerda + faixa * (indiceAtual + 1)}
              x2={MARGEM.esquerda + faixa * (indiceAtual + 1)}
              y1={MARGEM.topo - 14}
              y2={altura - MARGEM.base}
            />
            <text
              className="rotulo-eixo"
              x={MARGEM.esquerda + faixa * (indiceAtual + 1) + 6}
              y={MARGEM.topo - 6}
            >
              Previsão
            </text>
          </g>
        )}

        {meses.map((m, i) => {
          const quantidade = m.colunas.length
          const larguraColuna = Math.min(24, (faixa - 10 - (quantidade - 1) * 2) / quantidade)
          const totalLargura = larguraColuna * quantidade + (quantidade - 1) * 2
          const inicio = centro(i) - totalLargura / 2
          return (
            <g key={m.mes} className={ativo === i ? 'mes-ativo' : undefined}>
              {m.colunas.map((coluna, c) => {
                const x = inicio + c * (larguraColuna + 2)
                let acumulado = 0
                const visiveis = coluna.filter((s) => s.centavos !== 0)
                return visiveis.map((s, indice) => {
                  const base = acumulado
                  acumulado += s.centavos
                  const ultimo = indice === visiveis.length - 1
                  const y0 = y(base)
                  const y1 = y(acumulado)
                  const folga = ultimo || Math.abs(y0 - y1) <= 3 ? 0 : s.centavos > 0 ? 2 : -2
                  return (
                    <path
                      key={s.serieId}
                      fill={porId.get(s.serieId)?.cor}
                      d={caminhoBarra(x, larguraColuna, y1 + folga, y0, ultimo)}
                    />
                  )
                })
              })}
              <text
                className={m.mes === mesAtual ? 'rotulo-eixo rotulo-forte' : 'rotulo-eixo'}
                x={centro(i)}
                y={altura - 8}
                textAnchor="middle"
              >
                {formatarMesEixo(m.mes)}
              </text>
            </g>
          )
        })}

        {serieLinha && (
          <>
            <polyline
              className="linha-grafico"
              stroke={serieLinha.cor}
              points={meses.map((m, i) => `${centro(i)},${y(m.linha ?? 0)}`).join(' ')}
            />
            {meses.map((m, i) => (
              <circle
                key={m.mes}
                className="ponto-grafico"
                fill={serieLinha.cor}
                cx={centro(i)}
                cy={y(m.linha ?? 0)}
                r={4}
              />
            ))}
          </>
        )}

        {meses.map((m, i) => (
          <rect
            key={m.mes}
            className="alvo-grafico"
            x={MARGEM.esquerda + faixa * i}
            y={MARGEM.topo - 14}
            width={faixa}
            height={altura - MARGEM.topo - MARGEM.base + 14}
            tabIndex={0}
            aria-label={formatarMes(m.mes)}
            onPointerEnter={() => setAtivo(i)}
            onPointerLeave={() => setAtivo(null)}
            onFocus={() => setAtivo(i)}
            onBlur={() => setAtivo(null)}
          />
        ))}
      </svg>

      {detalhe && ativo !== null && (
        <div
          className="dica"
          style={{
            left: Math.min(Math.max(centro(ativo), 110), largura - 110),
            top: 8
          }}
        >
          <div className="dica-titulo">{formatarMes(detalhe.mes)}</div>
          {detalhe.linha !== undefined && serieLinha && (
            <div className="dica-linha">
              <span className="chave-dica" style={{ background: serieLinha.cor }} />
              <strong>{formatarReais(detalhe.linha)}</strong> {serieLinha.rotulo}
            </div>
          )}
          {detalhe.colunas.flat().map((s) => {
            const serie = porId.get(s.serieId)
            return (
              <div className="dica-linha" key={s.serieId}>
                <span className="chave-dica" style={{ background: serie?.cor }} />
                <strong>{formatarReais(s.centavos)}</strong> {serie?.rotulo}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
