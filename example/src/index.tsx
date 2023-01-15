import { Accessor, Component, createComputed, createSignal } from 'solid-js'

export function createHello(): [Accessor<string>, (to: string) => void] {
  const [hello, setHello] = createSignal('Hello World!')

  return [hello, (to: string) => setHello(`Hello ${to}!`)]
}

export const Hello: Component<{ to?: string }> = props => {
  const [hello, setHello] = createHello()

  // This will only log during development, console is removed in production
  console.log('Hello World!')

  if (import.meta.env.SSR) {
    // This will only log during server side rendering
    console.log('Hello Server!')
  } else {
    window.addEventListener('load', () => {})
  }

  createComputed(() => {
    if (typeof props.to === 'string') setHello(props.to)
  })

  return (
    <>
      <div>{hello()}</div>
    </>
  )
}
