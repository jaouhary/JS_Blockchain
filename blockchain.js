// SHA-256 library
var forge = require('node-forge');

// Unique identifier library
const uuid = require('uuid/v1');

class Blockchain {
    constructor() {
        this.chain = [];
        this.pendingOperations = [];

        this.currentNodeUrl = "";
        this.networkNodes = [];

        // Create a genesis block

        this.createNewBlock(0, '0', '0');
    }

    createNewBlock(nonce,previousBlockHash,hash) {
        // Create a new block to add

        var newBlock = {
            index: this.chain.length + 1,
            timestamp: Date.now(),
            operations: this.pendingOperations,
            nonce: nonce,
            hash: hash,
            previousBlockHash : previousBlockHash
        };

        // Create room for new operations 
        this.pendingOperations = [];

        // Push the new block into the chain
        this.chain.push(newBlock);

        // Return the new block
        return newBlock;
    }

    getLastBlock() {
        // Get the latest block added to the chain
        return this.chain[this.chain.length - 1];
    }

    createNewOperation(message, sender, recipient) {
        // Create a new operation

        var newOperation = {
            message: message,
            sender : sender,
            recipient : recipient,
            operationId : uuid().split('-').join('')
        }

        return newOperation;
    }
    pushNewOperation(newOperation) {
        // Push the new operation with the other operations
        this.pendingOperations.push(newOperation);

        return this.getLastBlock()['index'] + 1;
    }

    hashBlock(previousBlockHash, nonce, currentBlockData) {
        // Change all the parameters to strings

        const dataAsString = previousBlockHash + nonce.toString() + JSON.stringify(currentBlockData) ;
        
        var md = forge.md.sha256.create();

        md.update(dataAsString);

        return md.digest().toHex();

        // return the hash
    }

    proofOfWork(previousBlockHash, currentBlockData) {
        let nonce = 0;
        let hash = this.hashBlock(previousBlockHash, nonce, currentBlockData);
        while(hash.substring(0,4)!=="0000") {
            nonce++;
            hash = this.hashBlock(previousBlockHash, nonce, currentBlockData);
        }

        // return the nonce value 

        return nonce;
    }

    chainIsValid(blockchain) {
        let chainValid = true;

        // Verify the chain without the genesis block
        for(var i=1; i< blockchain.length; i++) {
            const currBlock = blockchain[i];
            const prevBlock = blockchain[i-1]; 
            const blockHash = this.hashBlock(prevBlock['hash'], currBlock['nonce'], {operations: currBlock['operations'], index: currBlock['index']});
            if(blockHash.substring(0,4)!=="0000") {
                chainValid = false;
            }
            if (prevBlock['hash'] !== currBlock['previousBlockHash']) {
                chainValid = false;
            }
        }

        // Verify the genesis block
        const genesisBlock = blockchain[0];
        const correctNonce = genesisBlock['nonce'] === 0;
        const correctPreviousBlockHash = genesisBlock['previousBlockHash'] === '0';
        const correctHash = genesisBlock['hash'] === '0';
        const correctOperations = genesisBlock['operations'].length === 0;

        if(!correctNonce || !correctPreviousBlockHash || !correctHash || !correctOperations) {
            chainValid = false;
        }

        return chainValid;
    }

    getBlock(blockHash) {
        let resBlock = null;
        this.chain.forEach(block => {
            if (block.hash === blockHash) {
                resBlock = block;
            }
        })
        return resBlock;
    }

    getOperation(operationId) {
        let resOperation = null;
        let resBlock = null;

        this.chain.forEach(block => {
            block.operations.forEach(operation => {
                if (operation.operationId === operationId) {
                   resOperation = operation;
                   resBlock = block;
                }
            })
        })
        
        return {
            operation: resOperation,
            block: resBlock
        }
    }

    getAddressData(address) {
        const operations = [];
        let balance = 0;

        this.chain.forEach(block => {
            block.operations.forEach(operation => {
                if (address === operation.sender) {
                   operations.push(operation);
                   balance -= operation.message;
                } else if (address === operation.recipient) {
                   operations.push(operation);
                   balance += operation.message;
                }
            })
        })

        return {
            operations: operations,
            balance: balance
        }
    }
}

module.exports = Blockchain;
