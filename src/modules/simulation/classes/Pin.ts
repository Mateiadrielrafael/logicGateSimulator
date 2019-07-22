import { SubscriptionData } from '../types/SubscriptionData'
import { BehaviorSubject } from 'rxjs'
import { Gate } from './Gate'

/* Types:

First bit = input
Second bit = output

*/
export class Pin {
    public state = new BehaviorSubject(false)
    public pairs = new Set<Pin>()

    private subscriptions: SubscriptionData<Pin>[] = []

    public constructor(public type = 0b01, public gate: Gate) {}

    public addPair(pin: Pin, subscribe = false) {
        this.pairs.add(pin)

        if (subscribe) {
            const rawSubscription = pin.state.subscribe(state => {
                this.state.next(state)
            })

            this.subscriptions.push({
                data: pin,
                subscription: rawSubscription
            })
        }
    }

    public removePair(pin: Pin) {
        this.pairs.delete(pin)

        for (const subscription of this.subscriptions) {
            if (subscription.data === pin) {
                subscription.subscription.unsubscribe()
            }
        }

        this.subscriptions = this.subscriptions.filter(
            subscription => subscription.data !== pin
        )
    }

    public dispose() {
        for (const subscription of this.subscriptions) {
            subscription.subscription.unsubscribe()
        }
    }
}