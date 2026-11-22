import { escapeHtml as esc } from './profile-render.js';

const currency = new Intl.NumberFormat('en-US', {style:'currency', currency:'USD'});
const money = cents => currency.format(cents / 100);
const dateLabel = iso => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', {
  month:'short', day:'numeric', timeZone:'UTC'
});

// Fictional activity for the explicitly selected preview. Amounts are integer cents.
const clients = [
  {name:'Jordan M.', digits:'4821'}, {name:'Taylor R.', digits:'7306'},
  {name:'Alex D.', digits:'2140'}, {name:'', digits:'0198'}
];
const samplePayments = [
  ['2026-11-22',0,'Weekly renewal','Paid','next'],
  ['2026-11-22',1,'First week','Pending',null],
  ['2026-11-21',2,'Weekly renewal','Failed',null],
  ['2026-11-20',3,'First week','Refunded',null],
  ['2026-11-15',0,'Weekly renewal','Paid','current'],
  ['2026-11-14',2,'First week','Paid','current'],
  ['2026-11-08',0,'First week','Paid','previous']
].map(([date, client, type, status, payout]) => ({
  date, client:clients[client], type, status, payout,
  paid:['Paid','Refunded'].includes(status) ? 399 : 0,
  earnings:status === 'Paid' ? 319 : 0
}));
const payouts = [
  {id:'next', date:'2026-11-30', status:'Scheduled'},
  {id:'current', date:'2026-11-23', status:'On the way'},
  {id:'previous', date:'2026-11-12', status:'Deposited'}
];
const paymentStates = ['Paid','Pending','Failed','Refunded'];
const payoutStates = ['Scheduled','On the way','Deposited','Failed'];
const badge = state => '<span class="badge badge-' +
  (state === 'On the way' ? 'transit' : state.toLowerCase()) + '">' + esc(state) + '</span>';
const clientName = client => client.name || 'Client ending in ' + client.digits;
const sum = rows => rows.reduce((total, item) => total + item.earnings, 0);

export function initIncome() {
  const $ = id => document.getElementById(id);
  let sample = false;
  let tab = 'payments';
  const payments = () => sample ? samplePayments : [];
  const transfers = () => sample ? payouts : [];
  const included = id => payments().filter(row => row.payout === id);

  function openDetail(title, entries) {
    $('panelTitle').textContent = title;
    const list = document.createElement('dl');
    for (const [label, value] of entries) {
      const line = document.createElement('div');
      const term = document.createElement('dt');
      const description = document.createElement('dd');
      term.textContent = label;
      description.textContent = value;
      line.append(term, description);
      list.append(line);
    }
    $('panel').replaceChildren(list);
    $('panel').closest('dialog').showModal();
  }

  function payoutDetail(payout) {
    const items = included(payout.id);
    openDetail('Sample payout details', [
      ['Status',payout.status], ['Arrival' + (payout.status === 'Deposited' ? '' : ' estimate'),dateLabel(payout.date)],
      ...items.map(row => [clientName(row.client) + ' · ' + dateLabel(row.date),money(row.earnings)]),
      ['Creator payout',money(sum(items))]
    ]);
  }

  function paymentDetail(row) {
    const payout = transfers().find(item => item.id === row.payout);
    const entries = [
      ['Client',clientName(row.client)], ['Phone ending',row.client.digits],
      ['Date',dateLabel(row.date)], ['Plan',row.type + ' · $3.99/week'], ['Status',row.status],
      ['Amount paid',money(row.paid)]
    ];
    if (row.status === 'Refunded') entries.push(['Refund',money(row.paid)]);
    if (row.status === 'Paid') entries.push(['Illustrative platform share',money(row.paid - row.earnings)]);
    entries.push(['Creator earnings',money(row.earnings)], ['Payout',payout ? payout.status + ' · ' + dateLabel(payout.date) : 'No payout assigned']);
    openDetail('Sample payment details', entries);
  }

  function overview() {
    $('income-total').textContent = money(sum(payments()));
    const cards = [
      ['Current payout','current','No payout on the way'],
      ['Next payout','next','No payout scheduled'],
      ['Paid this month','previous','0 deposits']
    ];
    $('payout-cards').innerHTML = cards.map(([label,id,empty]) => {
      const payout = transfers().find(item => item.id === id);
      const caption = payout ? payout.status + ' · ' + dateLabel(payout.date) : empty;
      return '<section class="payout-card"><h2>' + label + '</h2><strong>' + money(sum(included(id))) +
        '</strong><p>' + caption + '</p>' + (payout ? '<button class="income-detail-link" data-payout="' + id +
        '">View breakdown</button>' : '') + '</section>';
    }).join('');
    const weeks = [['2026-11-02','Nov 2 to 8'],['2026-11-09','Nov 9 to 15'],['2026-11-16','Nov 16 to 22']];
    const amounts = weeks.map(([start], i) => sum(payments().filter(row =>
      row.date >= start && (!weeks[i+1] || row.date < weeks[i+1][0]))));
    $('income-trend').innerHTML = sample ? weeks.map(([,label], i) =>
      '<div class="week-line"><span>' + label + '</span><div><i style="width:' + (100 * amounts[i] / Math.max(...amounts,1)) +
      '%"></i></div><strong>' + money(amounts[i]) + '</strong></div>').join('') :
      '<p>Your weekly earnings will appear after your first client payment.</p>';
  }

  function activity() {
    const isPayments = tab === 'payments';
    const status = $('activity-filter').value;
    const query = isPayments ? $('client-search').value.trim().toLowerCase() : '';
    const results = (isPayments ? payments() : transfers()).filter(row =>
      (!status || row.status === status) &&
      (!query || (clientName(row.client) + ' ' + row.client.digits).toLowerCase().includes(query)));
    const host = $('activity-list');
    if (!results.length) {
      const heading = status || query ? 'No matching results' : isPayments ? 'No client payments yet' : 'No payouts yet';
      host.innerHTML = '<div class="income-empty"><strong>' + heading + '</strong><p>' +
        (status || query ? 'Try another search or status.' : isPayments ? 'Your clients’ first payments and weekly renewals will appear here.' :
          'Transfers to your bank will appear here.') + '</p></div>';
      return;
    }
    const columns = isPayments ? ['Client','Date','Payment type','Amount paid','Your earnings','Status'] :
      ['Payout','Amount','Status'];
    const wide = i => isPayments && i >= 1 && i <= 3 ? 'wide-only' : '';
    const rows = results.map((row,index) => {
      const cells = isPayments ? [
        '<button data-entry="' + index + '">' + esc(clientName(row.client)) + '</button><small>' +
        (row.client.name ? '•• ' + esc(row.client.digits) : '') + '<span class="compact-date">' +
        (row.client.name ? ' · ' : '') + dateLabel(row.date) + '</span></small>',
        dateLabel(row.date), esc(row.type), money(row.paid), money(row.earnings), badge(row.status)
      ] : ['<button data-entry="' + index + '">' + dateLabel(row.date) + '</button>',money(sum(included(row.id))),badge(row.status)];
      return '<tr>' + cells.map((cell,i) => '<td class="' + wide(i) + '">' + cell + '</td>').join('') + '</tr>';
    });
    host.innerHTML = '<table class="income-table"><thead><tr>' + columns.map((name,i) =>
      '<th scope="col" class="' + wide(i) + '">' + name + '</th>').join('') + '</tr></thead><tbody>' + rows.join('') + '</tbody></table>';
    host.querySelectorAll('[data-entry]').forEach(button => button.onclick = () => {
      const entry = results[Number(button.dataset.entry)];
      if (isPayments) paymentDetail(entry); else payoutDetail(entry);
    });
  }

  function selectTab(next) {
    tab = next;
    document.querySelectorAll('[data-activity]').forEach(button =>
      button.setAttribute('aria-pressed', String(tab === button.dataset.activity)));
    $('client-search-label').hidden = tab !== 'payments';
    $('client-search').value = '';
    const options = tab === 'payments' ? paymentStates : payoutStates;
    $('activity-filter').replaceChildren(new Option('All statuses',''), ...options.map(name => new Option(name,name)));
    activity();
  }

  $('income-sample').onclick = () => {
    sample = !sample;
    $('income-status').textContent = sample ? 'Sample data · November 2026' : 'Payments not connected';
    $('income-sample').textContent = sample ? 'Exit sample view' : 'Preview sample data';
    $('income-sample').setAttribute('aria-pressed',String(sample));
    overview();
    selectTab(tab);
  };
  $('payout-cards').onclick = event => {
    const button = event.target.closest('[data-payout]');
    if (button) payoutDetail(transfers().find(item => item.id === button.dataset.payout));
  };
  document.querySelectorAll('[data-activity]').forEach(button => button.onclick = () => selectTab(button.dataset.activity));
  $('client-search').oninput = activity;
  $('activity-filter').onchange = activity;
  overview();
  selectTab(tab);
}
