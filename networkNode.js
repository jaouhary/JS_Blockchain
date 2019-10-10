const express = require('express')
const app = express()
const bodyParser = require('body-parser')
const Blockchain = require('./blockchain.js')
const uuid = require('uuid/v1')
const rp = require('request-promise')

const port = process.argv[2]; 

const currentNodeUrl = process.argv[3];

// Determine the node's address

const nodeAddress = uuid().split('-').join('');

bitcoin = new Blockchain();

// Add the corresponding URL to the node
bitcoin.currentNodeUrl = currentNodeUrl;

app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: false}))
 
// Endpoint that shows the whole blockchain

app.get('/blockchain', function (req, res) {
    res.send(bitcoin);
})

// Endpoint that creates a new operation

app.post('/operation', function (req, res) {
    const newOperation = req.body;
    const blockIndex = bitcoin.pushNewOperation(newOperation);
    res.json({
        note: `The new operation was added to the index ${blockIndex}`
    });
})

// Endpoint that mines the current pending operations into the chain
 
app.get('/mine', function (req, res) {

    // Retrieve the previous hash
    const previousBlock = bitcoin.getLastBlock();
    const previousBlockHash = previousBlock['hash'];

    // Retrieve the nonce
    const currentBlockData = {
        operations: bitcoin.pendingOperations,
        index: previousBlock['index'] + 1
    }
    nonce = bitcoin.proofOfWork(previousBlockHash, currentBlockData);

    // Retrieve the hash
    const hash = bitcoin.hashBlock(previousBlockHash, nonce, currentBlockData);
    const newBlock = bitcoin.createNewBlock(nonce, previousBlockHash, hash);
 
    // Share the block with the network
    const requestPromises = [];
    bitcoin.networkNodes.forEach(networkNodeUrl => {
        const requestOptions = {
            url: networkNodeUrl + '/receive-block',
            method: 'POST',
            body: { newBlock: newBlock},
            json: true
        }

        requestPromises.push(rp(requestOptions));
    })

    Promise.all(requestPromises)
    .then( data => {
        // Give a reward for mining
        const requestOptions = {
            url: bitcoin.currentNodeUrl + "/operation/broadcast",
            method: 'POST',
            body: {
                message: 1,
                sender: "admin",
                recipient: nodeAddress
            },
            json: true
        }

        return rp(requestOptions);
    }).then( data => {
        res.json({
            body: "The block was mined and broadcasted successfully",
            block: newBlock
        });
    })
    
})

app.post('/receive-block', function(req, res) {
    const newBlock = req.body.newBlock;
    // Check if the block is legitimate
    const lastBlock = bitcoin.getLastBlock();
    const correctHash = newBlock.previousBlockHash === lastBlock.hash
    const correctIndex = newBlock['index'] === lastBlock['index'] + 1;
    if (correctHash && correctIndex) {
        bitcoin.chain.push(newBlock);
        bitcoin.pendingOperations = [];
        res.json ({
            body: "The block is accepted and added to the chain",
            newBlock: newBlock
        });
    } else {
        res.json({
            body: "The block is corrupted",
            newBlock: newBlock
        });
    }
})

app.post('/register-and-broadcast-node', function(req, res) {
    const newNodeUrl = req.body.newNodeUrl;
    
    if(bitcoin.networkNodes.indexOf(newNodeUrl) == -1) {
        bitcoin.networkNodes.push(newNodeUrl);
    } 

    const regNodesPromises = [];
    bitcoin.networkNodes.forEach(networkNodeUrl => {
        const requestOptions = {
            url: networkNodeUrl + '/register-node',
            method: 'POST',
            body: { newNodeUrl: newNodeUrl },
            json: true
        }

        regNodesPromises.push(rp(requestOptions));
    });
        
    Promise.all(regNodesPromises)
    .then(data => {
        const bulkRegisterOptions = {
            url: newNodeUrl + '/register-bulk-nodes',
            method: 'POST',
            body: { allNetworkNodes: [ ...bitcoin.networkNodes, bitcoin.currentNodeUrl ] },
            json: true
        }
        return rp(bulkRegisterOptions);
    }).then(data => {
        res.json({
             note: 'New node registered with network successfully'
        });
    })
        
    
})

app.post('/register-node', function(req, res) {
    const newNodeUrl = req.body.newNodeUrl;
    const nodeNotAlreadyPresent = bitcoin.networkNodes.indexOf(newNodeUrl) == -1;
    const notCurrentNodeUrl = bitcoin.currentNodeUrl !== newNodeUrl;
    if (nodeNotAlreadyPresent && notCurrentNodeUrl) {
        bitcoin.networkNodes.push(newNodeUrl);
    }
    res.json({
        note: `New node registered successfully with the node at port ${port}`
    });
})

app.post('/register-bulk-nodes', function(req, res) {
    const allNetworkNodes = req.body.allNetworkNodes;
    allNetworkNodes.forEach(networkNodeUrl => {
        const nodeNotAlreadyPresent = bitcoin.networkNodes.indexOf(networkNodeUrl) == -1;
        const notCurrentNodeUrl = bitcoin.currentNodeUrl !== networkNodeUrl;
        if (nodeNotAlreadyPresent && notCurrentNodeUrl ) {
            bitcoin.networkNodes.push(networkNodeUrl);
        }
    })
    res.json({
        note: 'Bulk registered successfully'
    })
})

app.post('/operation/broadcast', function(req, res) {
    const message = req.body.message;
    const sender = req.body.sender;
    const recipient = req.body.recipient;
    const operationToBroadcast = bitcoin.createNewOperation(message, sender, recipient);

    bitcoin.pushNewOperation(operationToBroadcast);

    const requestPromises = [];
    bitcoin.networkNodes.forEach(networkNodeUrl => {
        const requestOptions = {
            url: networkNodeUrl + '/operation',
            method: 'POST',
            body: operationToBroadcast,
            json: true
        }

        requestPromises.push(rp(requestOptions));
    })

    Promise.all(requestPromises)
    .then(data => {
        res.json({ note: 'New operation registered successfully in the network'})
    });
})

app.get('/consensus', function(req, res) {
    const requestPromises = []; 
    bitcoin.networkNodes.forEach(networkNodeUrl => {
         const requestOptions = {
             url: networkNodeUrl + '/blockchain',
             method: 'GET',
             json: true
         }

         requestPromises.push(rp(requestOptions));
    })

    Promise.all(requestPromises)
    .then(blockchains => {
        const currChainLength = bitcoin.chain.length;
        let maxChainLength = currChainLength;
        let newLongestChain = null;
        let newPendingOperations = null;

        blockchains.forEach(blockchain => {  
            if (blockchain.chain.length >= maxChainLength) {
                newLongestChain = blockchain.chain;
                newPendingOperations = blockchain.pendingOperations;
                maxChainLength = blockchain.chain.length;
            }
        }) 

        if ( !newLongestChain || (newLongestChain && !bitcoin.chainIsValid(newLongestChain)) ) {
            res.json({
                note: "There is no longer chain than the current one",
                chain: bitcoin.chain
            });
        } else {
            bitcoin.chain = newLongestChain;
            bitcoin.pendingOperations = newPendingOperations;
            res.json({
                note : "There is a longer chain",
                chain: bitcoin.chain
            });
        }
        
    })
})

app.get('/block/:blockHash', function(req, res) {
    const blockHash = req.params.blockHash;
    const correctBlock = bitcoin.getBlock(blockHash);
    res.json({
        block: correctBlock
    })       
}) 

app.get('/operation/:operationId', function(req, res) {
    const operationId = req.params.operationId;
    const operationData = bitcoin.getOperation(operationId);
    res.json({
        operation: operationData.operation,
        block: operationData.block
    })
})

app.get('/address/:address', function(req, res) {
    const address = req.params.address;
    const addressData = bitcoin.getAddressData(address);
    res.json({
        balance: addressData.balance,
        operations: addressData.operations
    })
})

app.get('/block-explorer', function(req, res) {
    res.sendFile('./block-explorer/index.html', { root : __dirname });
})

app.listen(port, function () {
    console.log(`Listening on port ${port}`);
})