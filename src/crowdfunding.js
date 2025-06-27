import web3 from './web3';
import abi from './abi.json';

const address = '0x238E3678db35c906A2249fEb01c7A67bD79c7118'; 
const crowdfunding = new web3.eth.Contract(abi, address);

export default crowdfunding;
