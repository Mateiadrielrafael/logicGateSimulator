import { Singleton } from "@eix/utils";
import { Component } from "../component";
import { Subject, BehaviorSubject, fromEvent } from "rxjs";
import { svg, SVGTemplateResult } from "lit-html";
import { subscribe } from "lit-rx";
import { Screen } from "../screen.ts";
import { ManagerState } from "./interfaces";
import { Store } from "../store";
import { KeyboardInput } from "@eix/input"
import { success, error } from "toastr"
import { ComponentTemplateStore } from "./componentTemplateStore";
import { alertOptions } from "./alertOptions";
import { WireManager } from "../wires";
import { runCounter } from "../component/runCounter";
import { Settings } from "../store/settings";
import { download } from "./download";

@Singleton
export class ComponentManager {
    public components: Component[] = []
    public svgs = new Subject<SVGTemplateResult>()
    public placeholder = new BehaviorSubject("Create simulation")

    private temporaryCommnad = ""
    private onTop: Component
    private clicked = false

    private screen = new Screen()
    private wireManager = new WireManager()
    private templateStore = new ComponentTemplateStore()
    private settings = new Settings()

    private commandHistoryStore = new Store<string>("commandHistory")
    private store = new Store<ManagerState>("simulationStates")

    private saveEvent = new KeyboardInput("s")
    private createEvent = new KeyboardInput("m")
    private closeInputEvent = new KeyboardInput("enter")
    private ctrlEvent = new KeyboardInput("ctrl")
    private palleteEvent = new KeyboardInput("p")
    private shiftEvent = new KeyboardInput("shift")
    private refreshEvent = new KeyboardInput("r")
    private clearEvent = new KeyboardInput("c")
    private upEvent = new KeyboardInput("up")
    private downEvent = new KeyboardInput("down")

    public name = "current"
    public alertOptions = alertOptions

    private commandHistory: string[] = []
    private commands: {
        [key: string]: (ctx: ComponentManager, args: string[], flags: string[]) => any
    } = {
            clear(ctx: ComponentManager) {
                ctx.clear()
            },
            save(ctx: ComponentManager) {
                ctx.save()
            },
            ls(ctx: ComponentManager) {
                const data = ctx.store.ls()
                const message = data.join("\n")

                success(message, "", ctx.alertOptions)
            },
            help(ctx: ComponentManager) {
                success(`Usage: &ltcommand> <br>
            Where &ltcommand> is one of:
                <ul>
                ${Object.keys(ctx.commands).map(val => `
                    <li>${val}</li>
                `).join("")}
                </ul>
            `, "", ctx.alertOptions)
            },
            refresh(ctx: ComponentManager) {
                ctx.refresh()
            },
            ctp: this.templateStore.commands.template,
            settings: this.settings.commands,
            download
        }
    private inputMode: string

    public barAlpha = new BehaviorSubject<string>("0");

    constructor() {
        runCounter.increase()

        this.svgs.next(this.render())

        this.refresh()

        fromEvent(document.body, "keydown").subscribe((e: KeyboardEvent) => {
            if (this.barAlpha.value == "1") {
                const elem = document.getElementById("nameInput")
                elem.focus()
            }
            else {
                e.preventDefault()
            }
        })

        fromEvent(document.body, "keyup").subscribe((e: MouseEvent) => {
            if (this.barAlpha.value === "1") {
                if (this.closeInputEvent.value)
                    this.create()
                else if (this.inputMode === "command") {
                    const elem = <HTMLInputElement>document.getElementById("nameInput")
                    if (this.upEvent.value) {
                        document.body.focus()
                        e.preventDefault()
                        const index = this.commandHistory.indexOf(elem.value)

                        if (index) {
                            //save drafts
                            if (index === -1)
                                this.temporaryCommnad = elem.value

                            const newIndex = (index === -1) ? this.commandHistory.length - 1 : index - 1
                            elem.value = this.commandHistory[newIndex]
                        }
                    }
                    if (this.downEvent.value) {
                        document.body.focus()
                        e.preventDefault()
                        const index = this.commandHistory.indexOf(elem.value)

                        if (index > -1) {
                            const maxIndex = this.commandHistory.length - 1
                            elem.value = (index === maxIndex) ? this.temporaryCommnad : this.commandHistory[index + 1]
                        }
                    }
                }
            }
            else {
                if (this.ctrlEvent.value) {
                    if (this.createEvent.value) {
                        this.preInput()
                        this.inputMode = "create"
                        this.placeholder.next("Create simulation")
                    }
                    else if (this.shiftEvent.value && this.palleteEvent.value) {
                        this.preInput()
                        this.inputMode = "command"
                        this.placeholder.next("Command palette")
                    }
                    else if (this.clearEvent.value) {
                        this.clear()
                    }
                    else if (this.saveEvent.value) {
                        this.save()
                    }
                    else if (this.refreshEvent.value) {
                        this.refresh()
                    }
                }
            }
        })

        this.wireManager.update.subscribe(val => this.update())
    }

    preInput() {
        const elem = <HTMLInputElement>document.getElementById("nameInput")
        elem.value = ""
        this.barAlpha.next("1")
    }

    create() {
        const elem = <HTMLInputElement>document.getElementById("nameInput")
        this.barAlpha.next("0")

        if (this.inputMode == "create")
            success(`Succesfully created simulation ${elem.value}`, "", this.alertOptions)

        else if (this.inputMode == "command")
            this.eval(elem.value)
    }

    eval(command: string) {
        if (!this.commandHistory.includes(command)) // no duplicates
            this.commandHistory.push(command)

        while (this.commandHistory.length > 10) // max of 10 elements
            this.commandHistory.shift()

        const words = command.split(" ")

        if (words[0] in this.commands) {
            const remaining = words.slice(1)
            const flags = remaining.filter(val => val[0] == "-")
            const args = remaining.filter(val => val[0] != "-")
            this.commands[words[0]](this, args, flags)
        }
        else
            error(`Command ${words} doesn't exist. Run help to get a list of all commands.`,
                "", this.alertOptions)
    }

    clear() {
        this.components = []
        this.wireManager.dispose()
        this.update()

        success("Succesfully cleared all components", "", this.alertOptions)
    }

    refresh() {
        if (this.store.get(this.name)) {
            this.loadState(this.store.get(this.name))
        }

        for (const i of this.commandHistoryStore.ls())
            this.commandHistory[Number(i)] = this.commandHistoryStore.get(i)

        this.update()

        success("Succesfully refreshed to the latest save", "", this.alertOptions)
    }

    update() {
        this.svgs.next(this.render())
    }

    handleMouseDown(e: MouseEvent) {
        this.clicked = true
    }

    handleMouseUp(e: MouseEvent) {
        this.clicked = false
    }

    handleMouseMove(e: MouseEvent) {
        let toAddOnTop: number
        let outsideComponents = true

        for (let i = 0; i < this.components.length; i++) {
            const component = this.components[i]
            if (component.clicked) {
                outsideComponents = false
                component.move(e)
                if (this.onTop != component) {
                    toAddOnTop = i
                }
            }
        }

        if (toAddOnTop >= 0) {
            this.onTop = this.components[toAddOnTop]
            this.components.push(this.onTop)
            this.update()
        }

        else if (outsideComponents && this.clicked) {
            const mousePosition = [e.clientX, e.clientY]
            const delta = mousePosition.map((value, index) =>
                this.screen.mousePosition[index] - value
            ) as [number, number]
            this.screen.move(...delta)
        }
    }

    render() {
        let toRemoveDuplicatesFor: Component

        const size = 10
        const result = this.components.map(component => svg`
            <g>
                ${component.pinsSvg(10, 20)}
                ${component.pinsSvg(10, 20, "output")}

                <rect width=${ subscribe(component.width)}
                height=${ subscribe(component.height)} 
                x=${ subscribe(component.x)}
                y=${ subscribe(component.y)}
                fill="red"
                stroke="black"
                rx=20
                ry=20
                @mousedown=${ (e: MouseEvent) => component.handleClick(e)}
                @mouseup=${(e: MouseEvent) => {
                component.handleMouseUp(e)
                toRemoveDuplicatesFor = component
            }}></rect>
            </g>
        `);

        if (toRemoveDuplicatesFor)
            this.removeDuplicates(toRemoveDuplicatesFor)

        return svg`${this.wireManager.svg} ${result}`
    }

    private removeDuplicates(component: Component) {
        let instances = this.components
            .map((value, index) => (value == component) ? index : null)
            .filter(value => value)
        instances.pop()

        this.components = this.components
            .filter((val, index) => instances.indexOf(index) != -1)
    }

    get state(): ManagerState {
        const components = Array.from((new Set(this.components)).values())
        return {
            components: components.map(value => value.state),
            position: this.screen.position as [number, number],
            scale: this.screen.scale as [number, number],
            wires: this.wireManager.state
        }
    }

    public getComponentById(id: number) {
        return this.components.find(val => val.id === id)
    }

    loadState(state: ManagerState) {
        if (!state.wires) //old state
            return

        this.wireManager.dispose()
        this.clicked = false
        this.components = state.components.map(value => Component.fromState(value))
        this.onTop = null

        state.wires.forEach(val => {
            this.wireManager.start = this.getComponentById(val.from.owner).outputPins[val.from.index]
            this.wireManager.end = this.getComponentById(val.to.owner).inputPins[val.to.index]
            this.wireManager.tryResolving()
        })

        this.screen.scale = state.scale
        this.screen.position = state.position

        this.update()
    }

    save(name?: string) {
        for (let i = 0; i < this.commandHistory.length; i++) {
            const element = this.commandHistory[i];
            this.commandHistoryStore.set(i.toString(), element)
        }
        this.store.set(name || this.name, this.state)
        success("Saved the simulation succesfully!", "", this.alertOptions)
    }
}