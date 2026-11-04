import type { ReactNode } from 'react'

function Icone({ children }: { children: ReactNode }) {
  return (
    <svg
      className="icone"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export const IconeResumo = () => (
  <Icone>
    <path d="M4 20V10M10 20V4M16 20v-7M21 20H3" />
  </Icone>
)

export const IconeFixos = () => (
  <Icone>
    <path d="M17 2l4 4-4 4" />
    <path d="M3 12V9a3 3 0 0 1 3-3h15" />
    <path d="M7 22l-4-4 4-4" />
    <path d="M21 12v3a3 3 0 0 1-3 3H3" />
  </Icone>
)

export const IconePlanejar = () => (
  <Icone>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M16 3v4M8 3v4M3 11h18" />
  </Icone>
)

export const IconeLista = () => (
  <Icone>
    <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
  </Icone>
)

export const IconeAjustes = () => (
  <Icone>
    <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="8" cy="17" r="2" />
  </Icone>
)

export const IconeMais = () => (
  <Icone>
    <path d="M12 5v14M5 12h14" />
  </Icone>
)

export const IconeAlerta = () => (
  <Icone>
    <path d="M12 3l9.5 17h-19L12 3z" />
    <path d="M12 10v4M12 17h.01" />
  </Icone>
)

export const IconeCritico = () => (
  <Icone>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v5M12 16h.01" />
  </Icone>
)

export const IconeBom = () => (
  <Icone>
    <circle cx="12" cy="12" r="9" />
    <path d="M8 12.5l2.5 2.5L16 9.5" />
  </Icone>
)
