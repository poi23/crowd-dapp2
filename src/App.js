import React, { useEffect, useState, useCallback } from 'react';
import 'bootstrap/dist/css/bootstrap.css';
import web3 from './web3';
import BN from 'bn.js';
import crowdfunding from './crowdfunding';

export default function App() {
  const [account, setAccount] = useState('');
  const [owner, setOwner] = useState('');
  const [superOwner, setSuperOwner] = useState('');
  const [feeEth, setFeeEth] = useState('');
  const [balanceEth, setBalanceEth] = useState('');
  const [feesEth, setFeesEth] = useState('');
  const [info, setInfo] = useState('');

  // Campaign lists
  const [activeCampaigns, setActiveCampaigns] = useState([]);
  const [completedCampaigns, setCompletedCampaigns] = useState([]);
  const [cancelledCampaigns, setCancelledCampaigns] = useState([]);
  const [investments, setInvestments] = useState([]);

  // New campaign
  const [title, setTitle] = useState('');
  const [pledgeCostEth, setPledgeCostEth] = useState('');
  const [pledgesNeeded, setPledgesNeeded] = useState('');

  // Fund campaign
  const [fundId, setFundId] = useState('');
  const [shares, setShares] = useState('');

  // Manage campaign
  const [manageId, setManageId] = useState('');

  // Admin
  const [banAddr, setBanAddr] = useState('');
  const [newOwner, setNewOwner] = useState('');

  // Helper: fetch campaign details
  const getCampaign = async (id) => {
    try {
      const c = await crowdfunding.methods.getCampaign(id).call();
      return {
        id: c.id,
        entrepreneur: c.entrepreneur,
        title: c.title,
        pledgeCost: c.pledgeCost,
        pledgesNeeded: c.pledgesNeeded,
        pledgesCount: c.pledgesCount,
        totalRaised: c.totalRaised,
        status: c.status
      };
    } catch {
      return null;
    }
  };

  // Load all contract state
  const refreshContractState = useCallback(async () => {
    try {
      const feeWei = await crowdfunding.methods.CAMPAIGN_FEE().call();
      setFeeEth(web3.utils.fromWei(feeWei, 'ether'));

      const ow = await crowdfunding.methods.owner().call();
      setOwner(ow);

      const sow = await crowdfunding.methods.SUPER_OWNER().call();
      setSuperOwner(sow);

      const bal = await web3.eth.getBalance(crowdfunding.options.address);
      setBalanceEth(web3.utils.fromWei(bal, 'ether'));

      const fees = await crowdfunding.methods.getRemainingFeesAndRoyalties().call();
      setFeesEth(web3.utils.fromWei(fees, 'ether'));

      // Campaign lists
      const activeIds = await crowdfunding.methods.getActiveCampaigns().call();
      const completedIds = await crowdfunding.methods.getCompletedCampaigns().call();
      const cancelledIds = await crowdfunding.methods.getCancelledCampaigns().call();

      const [active, completed, cancelled] = await Promise.all([
        Promise.all(activeIds.map(getCampaign)),
        Promise.all(completedIds.map(getCampaign)),
        Promise.all(cancelledIds.map(getCampaign))
      ]);
      setActiveCampaigns(active.filter(Boolean));
      setCompletedCampaigns(completed.filter(Boolean));
      setCancelledCampaigns(cancelled.filter(Boolean));

      // Investments of user
      if (account) {
        const inv = await crowdfunding.methods.getInvestorInvestments(account).call();
        setInvestments(inv.ids.map((id, i) => ({
          id,
          shares: inv.sharesArr[i]
        })));
      } else {
        setInvestments([]);
      }

      setInfo('');
    } catch (err) {
      console.error(err);
      setInfo('Contract read failed – check ABI/address/network');
    }
  }, [account]);

  // Transaction helper
  const tx = async (methodCall, options = {}, successMsg = 'Transaction succeeded') => {
    setInfo('Waiting for confirmation…');
    try {
      await methodCall.send({ from: account, ...options });
      await refreshContractState();
      setInfo(successMsg);
    } catch (err) {
      console.error(err);
      setInfo(err.message || 'Transaction failed / rejected');
    }
  };

  // On mount & account change
  useEffect(() => {
    if (!window.ethereum) {
      setInfo('Install/unlock MetaMask');
      return;
    }
    async function init() {
      try {
        const [acc] = await window.ethereum.request({ method: 'eth_requestAccounts' });
        setAccount(acc);
      } catch (err) {
        setInfo('Could not connect – check MetaMask');
      }
    }
    window.ethereum.on('accountsChanged', async accs => {
      setAccount(accs[0] || '');
    });
    init();
  }, []);

  // Refresh contract state when account changes
  useEffect(() => {
    if (account) refreshContractState();
  }, [account, refreshContractState]);

  // Role checks
  const isAdmin = account && (account.toLowerCase() === owner.toLowerCase() || account.toLowerCase() === superOwner.toLowerCase());

  // Actions
  const createCampaign = async e => {
    e.preventDefault();
    const pledgeCostWei = web3.utils.toWei(pledgeCostEth || '0', 'ether');
    const feeWei = await crowdfunding.methods.CAMPAIGN_FEE().call();
    await tx(crowdfunding.methods.createCampaign(title, pledgeCostWei, pledgesNeeded), { value: feeWei }, 'Campaign created');
    setTitle(''); setPledgeCostEth(''); setPledgesNeeded('');
  };

  const fundCampaign = async (id, qty) => {
    const c = await getCampaign(id);
    if (!c) return setInfo('Campaign not found');
    const totalWei = new BN(c.pledgeCost).mul(new BN(qty)).toString();
    await tx(crowdfunding.methods.fundCampaign(id, qty), { value: totalWei }, 'Funded successfully');
  };

  const complete = id => tx(crowdfunding.methods.completeCampaign(id), {}, 'Campaign completed');
  const cancel = id => tx(crowdfunding.methods.cancelCampaign(id), {}, 'Campaign cancelled');
  const refundAll = () => tx(crowdfunding.methods.refundInvestments(), {}, 'Refund claimed');
  const withdraw = () => tx(crowdfunding.methods.withdrawOwnerFunds(), {}, 'Fees withdrawn');
  const destroy = () => tx(crowdfunding.methods.destroyContract(), {}, 'Contract destroyed');
  const ban = () => tx(crowdfunding.methods.banEntrepreneur(banAddr), {}, 'Entrepreneur banned');
  const changeOw = () => tx(crowdfunding.methods.changeOwner(newOwner), {}, 'Owner changed');

  // UI
  return (
    <div className="container" style={{ maxWidth: 800 }}>
      <h2 className="text-center mt-3 mb-4">Crowdfunding DApp</h2>

      <p><strong>Connected:</strong> {account || '—'}</p>
      <p><strong>Owner:</strong> {owner || '—'}</p>
      <p><strong>SuperOwner:</strong> {superOwner || '—'}</p>
      <p><strong>Contract Balance:</strong> {balanceEth} ETH</p>
      <p><strong>Fees/Royalties:</strong> {feesEth} ETH</p>
      <p><strong>Campaign Fee:</strong> {feeEth} ETH</p>

      <h4>New Campaign</h4>
      <form onSubmit={createCampaign} className="mb-3">
        <input className="form-control mb-2" placeholder="Title" value={title} onChange={e => setTitle(e.target.value)} required />
        <input className="form-control mb-2" placeholder="Pledge Cost (ETH)" value={pledgeCostEth} onChange={e => setPledgeCostEth(e.target.value)} required />
        <input className="form-control mb-2" placeholder="Pledges Needed" value={pledgesNeeded} onChange={e => setPledgesNeeded(e.target.value)} required />
        <button className="btn btn-primary w-100" disabled={isAdmin}>Create ({feeEth || '…'} ETH)</button>
        {isAdmin && <small className="text-muted">Owners cannot create campaigns</small>}
      </form>

      <h4>Active Campaigns</h4>
      <table className="table table-bordered">
        <thead>
          <tr>
            <th>ID</th><th>Title</th><th>Entrepreneur</th><th>Cost</th><th>Sold</th><th>Goal</th><th>My Shares</th><th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {activeCampaigns.map(c => (
            <tr key={c.id}>
              <td>{c.id}</td>
              <td>{c.title}</td>
              <td>{c.entrepreneur}</td>
              <td>{web3.utils.fromWei(c.pledgeCost, 'ether')}</td>
              <td>{c.pledgesCount}</td>
              <td>{c.pledgesNeeded}</td>
              <td>{investments.find(i => i.id === c.id)?.shares || 0}</td>
              <td>
                <button className="btn btn-success btn-sm me-1" onClick={() => fundCampaign(c.id, 1)} disabled={account === c.entrepreneur}>Pledge 1</button>
                <button className="btn btn-danger btn-sm me-1" onClick={() => cancel(c.id)} disabled={!(isAdmin || account === c.entrepreneur)}>Cancel</button>
                <button className="btn btn-warning btn-sm" onClick={() => complete(c.id)} disabled={!(isAdmin || account === c.entrepreneur) || Number(c.pledgesCount) < Number(c.pledgesNeeded)}>Fulfill</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h4>Completed Campaigns</h4>
      <table className="table table-bordered">
        <thead>
          <tr>
            <th>ID</th><th>Title</th><th>Entrepreneur</th><th>Raised</th><th>Goal</th>
          </tr>
        </thead>
        <tbody>
          {completedCampaigns.map(c => (
            <tr key={c.id}>
              <td>{c.id}</td>
              <td>{c.title}</td>
              <td>{c.entrepreneur}</td>
              <td>{web3.utils.fromWei(c.totalRaised, 'ether')}</td>
              <td>{c.pledgesNeeded}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h4>Cancelled Campaigns</h4>
      <table className="table table-bordered">
        <thead>
          <tr>
            <th>ID</th><th>Title</th><th>Entrepreneur</th><th>Goal</th>
          </tr>
        </thead>
        <tbody>
          {cancelledCampaigns.map(c => (
            <tr key={c.id}>
              <td>{c.id}</td>
              <td>{c.title}</td>
              <td>{c.entrepreneur}</td>
              <td>{c.pledgesNeeded}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h4>My Investments</h4>
      <ul>
        {investments.map(i => (
          <li key={i.id}>Campaign {i.id}: {i.shares} shares</li>
        ))}
      </ul>

      <h4>Refunds</h4>
      <button className="btn btn-info mb-4" onClick={refundAll}>Claim Refunds</button>

      {isAdmin && (
        <>
          <h4>Admin Panel</h4>
          <div className="d-flex gap-2 mb-2">
            <button className="btn btn-dark flex-fill" onClick={withdraw}>Withdraw Fees</button>
            <button className="btn btn-outline-danger flex-fill" onClick={destroy}>Destroy Contract</button>
          </div>
          <input className="form-control mb-2" placeholder="Address to Ban" value={banAddr} onChange={e => setBanAddr(e.target.value)} />
          <button className="btn btn-outline-secondary w-100 mb-3" onClick={ban}>Ban Entrepreneur</button>
          <input className="form-control mb-2" placeholder="New Owner Address" value={newOwner} onChange={e => setNewOwner(e.target.value)} />
          <button className="btn btn-primary w-100" onClick={changeOw}>Change Owner</button>
        </>
      )}

      {info && <div className="alert alert-secondary mt-4">{info}</div>}
    </div>
  );
}