import { CircleAlert } from 'lucide-react'
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button, EmptyState } from './ui'

type Props = { children: ReactNode }
type State = { erro: Error | null }

/** Captura erros de renderização para a tela não ficar em branco. */
export class ErroTela extends Component<Props, State> {
  state: State = { erro: null }

  static getDerivedStateFromError(erro: Error): State {
    return { erro }
  }

  componentDidCatch(erro: Error, info: ErrorInfo) {
    console.error('Erro na tela:', erro, info.componentStack)
  }

  render() {
    if (!this.state.erro) return this.props.children
    return (
      <EmptyState
        icone={<CircleAlert />}
        cor="terracota"
        titulo="Algo quebrou nesta tela"
        descricao={this.state.erro.message}
        acao={<Button onClick={() => this.setState({ erro: null })}>Tentar de novo</Button>}
      />
    )
  }
}
