const createMemory = require("./create-memory");
const instructions = require("./instructions");

class CPU {
    constructor(memory) {
        this.memory = memory;

        this.registerNames = [
            "ip", "acc",
            "r1", "r2", "r3", "r4",
            "r5", "r6", "r7", "r8",
            "sp", "fp",
        ];

        this.registers = createMemory(this.registerNames.length * 2);

        this.registerMap = this.registerNames.reduce((map, name, i) => {
            map[name] = i * 2;
            return map;
        }, {});

        // place stack somewhere in memory (in the end)
        this.setRegister("sp", this.memory.byteLength -1 -1);
        this.setRegister("fp", this.memory.byteLength -1 -1);

        this.stackFrameSize = 0;
    }

    debug() {
        this.registerNames.forEach(name => {
            console.log(`${name}:\t0x${this.getRegister(name).toString(16).padStart(4, "0")}`);
            
        });
        console.log();
    }

    viewMemoryAt(address, n = 8) {
        const nextNBytes = Array.from({length: n}, (_, i) => 
            this.memory.getUint8(address + i)
        ).map(v => `0x${v.toString(16).padStart(2, "0")}`);

        console.log(`0x${address.toString(16).padStart(4, "0")}: ${nextNBytes.join(" ")}`);
    }

    getRegister(name) {
        if (!(name in this.registerMap)) {
            throw new Error(`getRegister: No such register '${name}'`);
        }
        return this.registers.getUint16(this.registerMap[name]);
    }

    setRegister(name, value) {
        if (!(name in this.registerMap)) {
            throw new Error(`setRegister: No such register '${name}'`);
        }
        return this.registers.setUint16(this.registerMap[name], value);
    }

    fetch() {
        const nextInstructionAddress = this.getRegister("ip");
        const instruction = this.memory.getUint8(nextInstructionAddress);
        this.setRegister("ip", nextInstructionAddress + 1);
        return instruction;
    }

    fetch16() {
        const nextInstructionAddress = this.getRegister("ip");
        const instruction = this.memory.getUint16(nextInstructionAddress);
        this.setRegister("ip", nextInstructionAddress + 2);
        return instruction;
    }

    push(value) {
        const spAddress = this.getRegister("sp");
        this.memory.setUint16(spAddress, value);
        this.setRegister("sp", spAddress - 2);
        this.stackFrameSize += 2;
    }

    pop() {
        const nextSpAddress = this.getRegister("sp") + 2;
        this.setRegister("sp", nextSpAddress);
        this.stackFrameSize -= 2;
        return this.memory.getUint16(nextSpAddress);
    }

    // save the CPU state on the stack
    pushState() {
        this.push(this.getRegister("r1"));
        this.push(this.getRegister("r2"));
        this.push(this.getRegister("r3"));
        this.push(this.getRegister("r4"));
        this.push(this.getRegister("r5"));
        this.push(this.getRegister("r6"));
        this.push(this.getRegister("r7"));
        this.push(this.getRegister("r8"));
        this.push(this.getRegister("ip")); //return address
        this.push(this.stackFrameSize + 2); // push the stackFrameSize
        this.setRegister("fp", this.getRegister("sp"));
        this.stackFrameSize = 0;
    }

    popState() {
        const framePointerAddress = this.getRegister("fp");
        this.setRegister("sp", framePointerAddress);

        this.stackFrameSize = this.pop();
        const stackFrameSize = this.stackFrameSize;

        this.setRegister("ip", this.pop());
        this.setRegister("r8", this.pop());
        this.setRegister("r7", this.pop());
        this.setRegister("r6", this.pop());
        this.setRegister("r5", this.pop());
        this.setRegister("r4", this.pop());
        this.setRegister("r3", this.pop());
        this.setRegister("r2", this.pop());
        this.setRegister("r1", this.pop());
        
        const nArgs = this.pop();
        for (let i = 0; i < nArgs; i++) {
            this.pop();
        }

        this.setRegister("fp", framePointerAddress + stackFrameSize);

    }

    fetchRegisterIndex() {
        return (this.fetch() % this.registerNames.length) * 2;
    }

    execute(instruction) {
        switch (instruction) {
            // move literal into register
            case instructions.MOV_LIT_REG: {
                const literal = this.fetch16();
                const register = this.fetchRegisterIndex();
                this.registers.setUint16(register, literal);
                return;
            }

            // move register into register
            case instructions.MOV_REG_REG: {
                const registerFrom = this.fetchRegisterIndex();
                const registerTo = this.fetchRegisterIndex();
                const value = this.registers.getUint16(registerFrom);
                this.registers.setUint16(registerTo, value);
                return;
            }

            // move register into memory
            case instructions.MOV_REG_MEM: {
                const registerFrom = this.fetchRegisterIndex();
                const address = this.fetch16();
                const value = this.registers.getUint16(registerFrom);
                this.memory.setUint16(address, value);
                return;
            }

            // move memory into register
            case instructions.MOV_MEM_REG: {
                const address = this.fetch16();
                const registerTo = this.fetchRegisterIndex();
                const value = this.memory.getUint16(address);
                this.registers.setUint16(registerTo, value);
                return;
            }

            // add reg and reg and put in acc
            case instructions.ADD_REG_REG: {
                const reg1 = this.fetchRegisterIndex();
                const reg2 = this.fetchRegisterIndex();
                const regsisterValue1 = this.registers.getUint16(reg1 * 2);
                const regsisterValue2 = this.registers.getUint16(reg2 * 2);
                this.setRegister("acc", regsisterValue1 + regsisterValue2);
                return;
            }

            // jump if not equal
            case instructions.JMP_NOT_EQ: {
                const value = this.fetch16();
                const address = this.fetch16();

                if (value != this.getRegister("acc")) {
                    this.setRegister("ip", address);
                }

                return;
            }

            // push literal value on stack
            case instructions.PSH_LIT: {
                const value = this.fetch16();
                this.push(value);
                return;
            }

            // push register value on to stack
            case instructions.PSH_REG: {
                const registerIndex = this.fetchRegisterIndex();
                const value = this.registers.getUint16(registerIndex);
                this.push(value);
                return;
            }

            // pop 
            case instructions.POP: {
                const registerIndex = this.fetchRegisterIndex();
                const value = this.pop();
                this.registers.setUint16(registerIndex, value);
                return;
            }

            // call literal
            case instructions.CALL_LIT: {
                const address = this.fetch16();
                // save the CPU state
                this.pushState();
                // set the ip to the subroutine
                this.setRegister("ip", address);
                return;
            }
            
            // call register
            case instructions.CALL_REG: {
                const registerIndex = this.fetchRegisterIndex();
                const address = this.registers.getUint16(registerIndex);
                // save the CPU state
                this.pushState();
                // set the ip to the subroutine
                this.setRegister("ip", address);
                return;
            }

            // return from subroutine
            case instructions.RET: {
                this.popState();
                return;
            }
        }
    }

    step() {
        const instruction = this.fetch();
        return this.execute(instruction);
    }
}

module.exports = CPU;