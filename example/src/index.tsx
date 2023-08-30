import { Accessor, Component, createComputed, createSignal } from 'solid-js'
import { additional } from './additional/index.js'
import { $SYMBOL, SharedEnum } from './shared.js'

export function createHello(): [Accessor<string>, (to: string) => void] {
    const [hello, setHello] = createSignal(
        `Hello ${
            import.meta.env.SSR ? 'Server' : import.meta.env.DEV ? 'Browser Dev' : 'Browser'
        }!`,
    )

    return [hello, (to: string) => setHello(`Hello ${to}!`)]
}

export const Hello: Component<{ to?: string }> = props => {
    const [hello, setHello] = createHello()

    // This will only log during development, console is removed in production
    console.log('Hello World!', SharedEnum.A)

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
            <div onClick={additional}>{hello()}</div>
        </>
    )
}

export { $SYMBOL, SharedEnum }
