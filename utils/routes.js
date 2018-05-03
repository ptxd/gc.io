'use strict';

const isNullOrUndefined = require('util');
const Web3 = require('web3');
const async = require('async');
const Request = require('request');

let web3 = new Web3();
web3.setProvider(new web3.providers.HttpProvider('http://localhost:7545'));

const template = `contract SafeMath {
    function safeAdd(uint a, uint b) public pure returns (uint c) {
        c = a + b;
        require(c >= a);
    }
    function safeSub(uint a, uint b) public pure returns (uint c) {
        require(b <= a);
        c = a - b;
    }
    function safeMul(uint a, uint b) public pure returns (uint c) {
        c = a * b;
        require(a == 0 || c / a == b);
    }
    function safeDiv(uint a, uint b) public pure returns (uint c) {
        require(b > 0);
        c = a / b;
    }
}

contract ERC20Interface {
    function totalSupply() public constant returns (uint);
    function balanceOf(address tokenOwner) public constant returns (uint balance);
    function allowance(address tokenOwner, address spender) public constant returns (uint remaining);
    function transfer(address to, uint tokens) public returns (bool success);
    function approve(address spender, uint tokens) public returns (bool success);
    function transferFrom(address from, address to, uint tokens) public returns (bool success);

    event Transfer(address indexed from, address indexed to, uint tokens);
    event Approval(address indexed tokenOwner, address indexed spender, uint tokens);
}

contract ApproveAndCallFallBack {
    function receiveApproval(address from, uint256 tokens, address token, bytes data) public;
}

contract Owned {
    address public owner;
    address public newOwner;

    event OwnershipTransferred(address indexed _from, address indexed _to);

    function Owned() public {
        owner = msg.sender;
    }

    modifier onlyOwner {
        require(msg.sender == owner);
        _;
    }

    function transferOwnership(address _newOwner) public onlyOwner {
        newOwner = _newOwner;
    }
    function acceptOwnership() public {
        require(msg.sender == newOwner);
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
        newOwner = address(0);
    }
}

contract OPTinToken is ERC20Interface, Owned, SafeMath {
    string public symbol;
    string public  name;
    uint8 public decimals;
    uint public _totalSupply;

    mapping(address => uint) balances;
    mapping(address => mapping(address => uint)) allowed;

    function OPTinToken() public {
        symbol = "OPT";
        name = "OPTin Token";
        decimals = 18;
        _totalSupply = 430000000 * 10**uint(decimals);
        balances[0x0212643Bedd14281Ba284a203EefF978E5FA2359] = _totalSupply;
        emit Transfer(address(0), 0x0212643Bedd14281Ba284a203EefF978E5FA2359, _totalSupply);
    }

    function totalSupply() public constant returns (uint) {
        return _totalSupply-balances[address(0)];
    }

    function balanceOf(address tokenOwner) public constant returns (uint balance) {
        return balances[tokenOwner];
    }

    function transfer(address to, uint tokens) public returns (bool success) {
        balances[msg.sender] = safeSub(balances[msg.sender], tokens);
        balances[to] = safeAdd(balances[to], tokens);
        emit Transfer(msg.sender, to, tokens);
        return true;
    }

    function approve(address spender, uint tokens) public returns (bool success) {
        allowed[msg.sender][spender] = tokens;
        emit Approval(msg.sender, spender, tokens);
        return true;
    }

    function transferFrom(address from, address to, uint tokens) public returns (bool success) {
        balances[from] = safeSub(balances[from], tokens);
        allowed[from][msg.sender] = safeSub(allowed[from][msg.sender], tokens);
        balances[to] = safeAdd(balances[to], tokens);
        emit Transfer(from, to, tokens);
        return true;
    }

    function allowance(address tokenOwner, address spender) public constant returns (uint remaining) {
        return allowed[tokenOwner][spender];
    }

    function approveAndCall(address spender, uint tokens, bytes data) public returns (bool success) {
        allowed[msg.sender][spender] = tokens;
        emit Approval(msg.sender, spender, tokens);
        ApproveAndCallFallBack(spender).receiveApproval(msg.sender, tokens, this, data);
        return true;
    }

    function () public payable {
        revert();
    }

    function transferAnyERC20Token(address tokenAddress, uint tokens) public onlyOwner returns (bool success) {
        return ERC20Interface(tokenAddress).transfer(owner, tokens);
    }
}`;

class Routes {

	constructor(app) {
		this.app = app;
	}

	/* creating app Routes starts */
	appRoutes() {

		this.app.get('/contract', function (request, response) {

			/* GUILDCRYPTO: THE FOLLOWING STEPS WILL CREATE A ERC20 TOKEN CONTRACT IN SOLIDITY AND DEPLOY ON ETHEREUM BLOCKCHAIN */

			/* STEP 1: GET CONTRACT TEMPLATE AND SET THE USER PARAMETERS */

			//TODO
			var input = template;

			/* STEP 2: COMPILE CONTRACT ON SOLIDITY, CONVERT TO JSON OBJ */
			var solc = require('solc');
			var output = solc.compile(input);
			var compiledContract = output.contracts[":OPTinToken"];

			/* STEP 3: AUTH WALLET */
			console.log("Unlocking account");
			let account = '0xA473467384Ae55Fc7183Bc77bD5495F1b79AB6C1';
			let password = '4222d99a32ab14e9c82d84345d11618b01d56c9933ef23532a21f9b1181b6d3f';

			web3.personal.unlockAccount(account, password)

			/* STEP 4: DEPLOY CONTRACT */
			let abiDefinition = JSON.parse(compiledContract.interface);
			let byteCode = compiledContract.bytecode;
			let ethContract = web3.eth.contract(abiDefinition);

			let contract = ethContract.new({ from: account, gas: 3000000, data: byteCode });
			console.log("Your contract is being deployed in transaction at http://testnet.etherscan.io/tx/" + contract.transactionHash);

			response.setHeader('Content-Type', 'application/json');
			response.send(contract.transactionHash);

			/* STEP 5: ALERT ME WHEN THE CONTRACT HAS BEEN CREATED */
			waitBlock(contract.transactionHash);
		});

		// http://stackoverflow.com/questions/951021/what-is-the-javascript-version-of-sleep
		function sleep(ms) {
			return new Promise(resolve => setTimeout(resolve, ms));
		}

		// We need to wait until any miner has included the transaction
		// in a block to get the address of the contract
		async function waitBlock(transactionHash) {
			while (true) {
				let receipt = web3.eth.getTransactionReceipt(transactionHash);
				if (receipt && receipt.contractAddress) {
					console.log("Your contract has been deployed at http://testnet.etherscan.io/address/" + receipt.contractAddress);
					console.log("Note that it might take 30 - 90 sceonds for the block to propagate befor it's visible in etherscan.io");
					break;
				}
				console.log("Waiting a mined block to include your contract... currently in block " + web3.eth.blockNumber);
				await sleep(4000);
			}
		}

		//test send ethers to another wallet
		this.app.get('/test', (request, response) => {

			let fromAccount = '0xA473467384Ae55Fc7183Bc77bD5495F1b79AB6C1';
			let fromAccountPassword = '4222d99a32ab14e9c82d84345d11618b01d56c9933ef23532a21f9b1181b6d3f';
			let toAccount = '0xF0b8b26e00f4E2bb5a15595c58139e0C7860F583';

			web3.personal.unlockAccount(fromAccount, fromAccountPassword)

			web3.eth.sendTransaction({
				from: fromAccount,
				to: toAccount,
				value: web3.toWei(1.9, "ether")
			});

			response.send('Transaction sended');
		});

		this.app.get('/', function (request, response) {
			response.send('Server ON');
		});

		this.app.get('/web', function (request, response) {
			response.redirect('web/');
		});

		this.app.get('/seed/:point', (request, response) => {
			if (isNullOrUndefined.isNullOrUndefined(request.params.point)) {
				let error = {
					isError: true,
					msg: "Error read parameter <point>"
				};
				response.status(400).json(error);
			}

			let seedPoint = request.params.point.toString();
			let data = {
				isError: false,
				seed: 'test'
			};
			response.status(200).json(data);
		})
	}

	routesConfig() {
		this.appRoutes();
	}

}

module.exports = Routes;