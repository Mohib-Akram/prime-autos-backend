require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

console.log('URL:', process.env.SUPABASE_URL);
console.log('KEY LENGTH:', process.env.SUPABASE_SERVICE_KEY ? process.env.SUPABASE_SERVICE_KEY.length : 'UNDEFINED');

// Test route
app.get('/', (req, res) => {
  res.send('Prime Autos backend chal raha hai!');
});

// Sab investors ki list laana
app.get('/investors', async (req, res) => {
  const { data, error } = await supabase
    .from('investors')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
});

// Naya investor add karna
app.post('/investors', async (req, res) => {
  const { name, amount } = req.body;

  if (!name || !amount) {
    return res.status(400).json({ error: 'Name aur amount dono chahiye' });
  }

  const { data, error } = await supabase
    .from('investors')
    .insert({
      name: name,
      total_invested: amount,
      cash_in_hand: amount
    })
    .select();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.status(201).json(data[0]);
});

// Nayi bike add karna
app.post('/bikes', async (req, res) => {
  const { investor_id, purchase_price, name } = req.body;

  if (!investor_id || !purchase_price) {
    return res.status(400).json({ error: 'investor_id aur purchase_price dono chahiye' });
  }

  const { data: investor, error: investorError } = await supabase
    .from('investors')
    .select('*')
    .eq('id', investor_id)
    .single();

  if (investorError || !investor) {
    return res.status(404).json({ error: 'Investor nahi mila' });
  }

  if (investor.cash_in_hand < purchase_price) {
    return res.status(400).json({ error: 'Investor ke paas itna cash nahi hai' });
  }

  const { data: bike, error: bikeError } = await supabase
    .from('bikes')
    .insert({
      investor_id: investor_id,
      purchase_price: purchase_price,
      total_cost: purchase_price,
      status: 'in_stock',
      name: name || null
    })
    .select()
    .single();

  if (bikeError) {
    return res.status(500).json({ error: bikeError.message });
  }

  const newCashInHand = investor.cash_in_hand - purchase_price;
  const { error: updateError } = await supabase
    .from('investors')
    .update({ cash_in_hand: newCashInHand })
    .eq('id', investor_id);

  if (updateError) {
    return res.status(500).json({ error: updateError.message });
  }

  res.status(201).json(bike);
});

// Sab bikes ki list (investor ke naam ke sath)
app.get('/bikes', async (req, res) => {
  const { data, error } = await supabase
    .from('bikes')
    .select('*, investors(name)')
    .order('created_at', { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
});

// Bike pe naya expense add karna
app.post('/expenses', async (req, res) => {
  const { bike_id, type, amount, payment_mode, supplier_id } = req.body;

  if (!bike_id || !type || !amount || !payment_mode) {
    return res.status(400).json({ error: 'bike_id, type, amount, payment_mode zaroori hain' });
  }

  if (payment_mode === 'udhaar' && !supplier_id) {
    return res.status(400).json({ error: 'Udhaar wale expense ke liye supplier_id chahiye' });
  }

  const { data: bike, error: bikeError } = await supabase
    .from('bikes')
    .select('*')
    .eq('id', bike_id)
    .single();

  if (bikeError || !bike) {
    return res.status(404).json({ error: 'Bike nahi mili' });
  }

  const { data: expense, error: expenseError } = await supabase
    .from('expenses')
    .insert({
      bike_id: bike_id,
      type: type,
      amount: amount,
      payment_mode: payment_mode,
      supplier_id: payment_mode === 'udhaar' ? supplier_id : null
    })
    .select()
    .single();

  if (expenseError) {
    return res.status(500).json({ error: expenseError.message });
  }

  const newTotalCost = Number(bike.total_cost) + Number(amount);
  const { error: bikeUpdateError } = await supabase
    .from('bikes')
    .update({ total_cost: newTotalCost })
    .eq('id', bike_id);

  if (bikeUpdateError) {
    return res.status(500).json({ error: bikeUpdateError.message });
  }

  const { data: investor } = await supabase
    .from('investors')
    .select('cash_in_hand')
    .eq('id', bike.investor_id)
    .single();

  const newCashInHand = Number(investor.cash_in_hand) - Number(amount);
  await supabase
    .from('investors')
    .update({ cash_in_hand: newCashInHand })
    .eq('id', bike.investor_id);

  if (payment_mode === 'udhaar') {
    const { data: supplier } = await supabase
      .from('suppliers')
      .select('total_udhaar')
      .eq('id', supplier_id)
      .single();

    const newTotalUdhaar = Number(supplier.total_udhaar) + Number(amount);
    await supabase
      .from('suppliers')
      .update({ total_udhaar: newTotalUdhaar })
      .eq('id', supplier_id);
  }

  res.status(201).json(expense);
});

app.post('/suppliers', async (req, res) => {
  const { name } = req.body;
  const { data, error } = await supabase
    .from('suppliers')
    .insert({ name: name })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

app.get('/suppliers', async (req, res) => {
  const { data, error } = await supabase
    .from('suppliers')
    .select('*');

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Udhaar ka breakdown — kis bike se, kis supplier ka, kitna
app.get('/udhaar-breakdown', async (req, res) => {
  const { data, error } = await supabase
    .from('expenses')
    .select('id, amount, created_at, bikes(name), suppliers(name)')
    .eq('payment_mode', 'udhaar')
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Supplier ko udhaar wapas karna
app.post('/supplier-payments', async (req, res) => {
  const { supplier_id, amount } = req.body;

  if (!supplier_id || !amount) {
    return res.status(400).json({ error: 'supplier_id aur amount zaroori hain' });
  }

  const { data: supplier, error: supplierError } = await supabase
    .from('suppliers')
    .select('total_udhaar, total_paid')
    .eq('id', supplier_id)
    .single();

  if (supplierError || !supplier) {
    return res.status(404).json({ error: 'Supplier nahi mila' });
  }

  const baaki = Number(supplier.total_udhaar) - Number(supplier.total_paid);

  if (Number(amount) > baaki) {
    return res.status(400).json({ error: `Sirf Rs ${baaki} baaki hai, itna zyada payment mat karo` });
  }

  const { data: payment, error: paymentError } = await supabase
    .from('supplier_payments')
    .insert({ supplier_id, amount })
    .select()
    .single();

  if (paymentError) {
    return res.status(500).json({ error: paymentError.message });
  }

  const newTotalPaid = Number(supplier.total_paid) + Number(amount);
  await supabase
    .from('suppliers')
    .update({ total_paid: newTotalPaid })
    .eq('id', supplier_id);

  res.status(201).json(payment);
});

// Bike sell karna
app.post('/bikes/:id/sell', async (req, res) => {
  const { id } = req.params;
  const { sale_price } = req.body;

  if (!sale_price) {
    return res.status(400).json({ error: 'sale_price zaroori hai' });
  }

  const { data: bike, error: bikeError } = await supabase
    .from('bikes')
    .select('*')
    .eq('id', id)
    .single();

  if (bikeError || !bike) {
    return res.status(404).json({ error: 'Bike nahi mili' });
  }

  if (bike.status === 'sold') {
    return res.status(400).json({ error: 'Yeh bike pehle hi sold hai' });
  }

  const profit = Number(sale_price) - Number(bike.total_cost);
  const investorShare = profit / 2;
  const primeAutosShare = profit / 2;

  const { error: updateBikeError } = await supabase
    .from('bikes')
    .update({
      status: 'sold',
      sale_price: sale_price,
      sold_at: new Date().toISOString()
    })
    .eq('id', id);

  if (updateBikeError) {
    return res.status(500).json({ error: updateBikeError.message });
  }

  // Investor ka cash_in_hand badhao (sirf capital wapas, profit nahi — wo cash mein diya ja chuka)
  const { data: investor } = await supabase
    .from('investors')
    .select('cash_in_hand')
    .eq('id', bike.investor_id)
    .single();

  const newCashInHand = Number(investor.cash_in_hand) + Number(bike.total_cost);
  await supabase
    .from('investors')
    .update({ cash_in_hand: newCashInHand })
    .eq('id', bike.investor_id);

  // Prime Autos ka profit share seedha Wallet mein jata hai
  const { data: wallet } = await supabase
    .from('prime_autos_wallet')
    .select('*')
    .single();

  const newWalletBalance = Number(wallet.balance) + primeAutosShare;
  await supabase
    .from('prime_autos_wallet')
    .update({ balance: newWalletBalance })
    .eq('id', wallet.id);

  await supabase
    .from('wallet_transactions')
    .insert({
      type: 'profit_in',
      amount: primeAutosShare,
      description: `Bike ${id} sale se profit`
    });

  const { data: saleRecord, error: saleError } = await supabase
    .from('sale_transactions')
    .insert({
      bike_id: id,
      investor_id: bike.investor_id,
      sale_price: sale_price,
      total_cost: bike.total_cost,
      profit: profit,
      investor_share: investorShare,
      prime_autos_share: primeAutosShare
    })
    .select()
    .single();

  if (saleError) {
    return res.status(500).json({ error: saleError.message });
  }

  // Is bike mein jitna udhaar tha, wo bata do — kis supplier ka kitna
  const { data: udhaarExpenses } = await supabase
    .from('expenses')
    .select('amount, supplier_id, suppliers(name)')
    .eq('bike_id', id)
    .eq('payment_mode', 'udhaar');

  const udhaarBySupplier = {};
  (udhaarExpenses || []).forEach(exp => {
    const key = exp.supplier_id;
    if (!udhaarBySupplier[key]) {
      udhaarBySupplier[key] = { supplier_name: exp.suppliers?.name, total: 0 };
    }
    udhaarBySupplier[key].total += Number(exp.amount);
  });

  // Har supplier ke liye ek "payable" row banao — yeh Prime Autos Wallet se BILKUL ALAG hai.
  // Is sale se aane wale paison mein se yeh amount supplier ko dena hai, Prime Autos ka apna nahi.
  for (const supplierId of Object.keys(udhaarBySupplier)) {
    await supabase
      .from('supplier_payables')
      .insert({
        bike_id: id,
        supplier_id: supplierId,
        amount: udhaarBySupplier[supplierId].total,
        paid: false
      });
  }

  res.status(201).json({ ...saleRecord, udhaar_reminder: Object.values(udhaarBySupplier) });
});

// Prime Autos Wallet ka balance dekhna
app.get('/wallet', async (req, res) => {
  const { data, error } = await supabase
    .from('prime_autos_wallet')
    .select('*')
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Salary/Rent/Food dena
app.post('/operational-expenses', async (req, res) => {
  const { type, amount } = req.body;

  if (!type || !amount) {
    return res.status(400).json({ error: 'type aur amount zaroori hain' });
  }

  const { data: wallet } = await supabase
    .from('prime_autos_wallet')
    .select('*')
    .single();

  const walletBalance = Number(wallet.balance);
  const expenseAmount = Number(amount);

  if (walletBalance >= expenseAmount) {
    await supabase
      .from('prime_autos_wallet')
      .update({ balance: walletBalance - expenseAmount })
      .eq('id', wallet.id);

    const { data: expense } = await supabase
      .from('operational_expenses')
      .insert({ type, amount: expenseAmount, source: 'wallet' })
      .select()
      .single();

    await supabase
      .from('wallet_transactions')
      .insert({ type: 'expense_out', amount: expenseAmount, description: `${type} payment` });

    return res.status(201).json({ message: 'Wallet se ada kiya gaya', expense });
  } else {
    const shortfall = expenseAmount - walletBalance;

    const { data: investors } = await supabase
      .from('investors')
      .select('*')
      .gte('cash_in_hand', shortfall)
      .limit(1);

    if (!investors || investors.length === 0) {
      return res.status(400).json({ error: 'Kisi investor ke paas itna cash nahi hai shortfall pura karne ke liye' });
    }

    const investor = investors[0];

    // Wallet ko negative mein le jao — yeh saaf dikhata hai ke Prime Autos
    // ke upar kitna udhaar hai abhi. Jab agla profit aayega, yeh khud
    // wapas upar (0 ya positive) ki taraf aayega.
    const newWalletBalance = walletBalance - expenseAmount;
    await supabase
      .from('prime_autos_wallet')
      .update({ balance: newWalletBalance })
      .eq('id', wallet.id);

    // Jaan-boojh kar investor ka cash_in_hand yahan TOUCH nahi kiya —
    // investor ko hamesha poora amount dikhna chahiye. Yeh sirf ek
    // internal reminder hai (GET /pool-deficits se) ke asal mein
    // kis investor ko physically wapis karna hai.

    const { data: expense } = await supabase
      .from('operational_expenses')
      .insert({ type, amount: expenseAmount, source: 'investor_pool', investor_id: investor.id })
      .select()
      .single();

    await supabase
      .from('pool_deficits')
      .insert({ investor_id: investor.id, amount: shortfall, resolved: false });

    await supabase
      .from('wallet_transactions')
      .insert({ type: 'expense_out', amount: expenseAmount, description: `${type} payment (${investor.name} se ${shortfall} udhaar liya)` });

    return res.status(201).json({
      message: `Wallet se ${walletBalance} liya, ${investor.name} se ${shortfall} liya gaya. Wallet balance ab ${newWalletBalance} hai.`,
      expense
    });
  }
});

// Sab operational expenses ki list (salary/rent history)
app.get('/operational-expenses', async (req, res) => {
  const { data, error } = await supabase
    .from('operational_expenses')
    .select('*')
    .order('date', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Sab pool deficits ki list
app.get('/pool-deficits', async (req, res) => {
  const { data, error } = await supabase
    .from('pool_deficits')
    .select('*, investors(name)')
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Deficit ko "wapis ho gaya" mark karna (koi paisa move nahi hota, sirf reminder hatta hai)
app.post('/pool-deficits/:id/resolve', async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase
    .from('pool_deficits')
    .update({ resolved: true })
    .eq('id', id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'Deficit resolved kar diya' });
});

// Sab supplier payables ki list (bike sale se aane wale, supplier ko dene wale paise)
app.get('/supplier-payables', async (req, res) => {
  const { data, error } = await supabase
    .from('supplier_payables')
    .select('*, suppliers(name), bikes(name)')
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Ek payable ko "de diya" mark karna — yeh supplier ke ledger mein bhi payment record karta hai
app.post('/supplier-payables/:id/pay', async (req, res) => {
  const { id } = req.params;
  const { amount } = req.body;

  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'Amount zaroori hai' });
  }

  const { data: payable, error: payableError } = await supabase
    .from('supplier_payables')
    .select('*')
    .eq('id', id)
    .single();

  if (payableError || !payable) {
    return res.status(404).json({ error: 'Payable nahi mila' });
  }

  const remaining = Number(payable.amount) - Number(payable.paid_amount);

  if (amount > remaining) {
    return res.status(400).json({ error: `Sirf Rs ${remaining} baaki hai, itna zyada mat do` });
  }

  const newPaidAmount = Number(payable.paid_amount) + Number(amount);
  const isFullyPaid = newPaidAmount >= Number(payable.amount);

  // Payable ka paid_amount badhao (partial ho sakta hai), aur poora paid hone par mark karo
  await supabase
    .from('supplier_payables')
    .update({ paid_amount: newPaidAmount, paid: isFullyPaid })
    .eq('id', id);

  // Supplier ke ledger mein bhi yeh payment record karo (total_paid badhao)
  const { data: supplier } = await supabase
    .from('suppliers')
    .select('total_paid')
    .eq('id', payable.supplier_id)
    .single();

  const newTotalPaid = Number(supplier.total_paid) + Number(amount);
  await supabase
    .from('suppliers')
    .update({ total_paid: newTotalPaid })
    .eq('id', payable.supplier_id);

  await supabase
    .from('supplier_payments')
    .insert({ supplier_id: payable.supplier_id, amount: amount });

  res.json({ message: isFullyPaid ? 'Poori payment ho gayi' : `Rs ${amount} de diya, Rs ${payable.amount - newPaidAmount} baaki hai` });
});

// Total Expense Report
app.get('/reports/expenses', async (req, res) => {
  // Sab expenses lao, bike ki info ke sath
  const { data: expenses, error } = await supabase
    .from('expenses')
    .select('*, bikes(id)');

  if (error) return res.status(500).json({ error: error.message });

  // Grand total
  const grandTotal = expenses.reduce((sum, exp) => sum + Number(exp.amount), 0);

  // Bike-wise breakdown
  const bikeWise = {};
  expenses.forEach(exp => {
    const bikeId = exp.bike_id;
    if (!bikeWise[bikeId]) bikeWise[bikeId] = 0;
    bikeWise[bikeId] += Number(exp.amount);
  });

  // Type-wise breakdown (parts, welding, colour, waghera)
  const typeWise = {};
  expenses.forEach(exp => {
    if (!typeWise[exp.type]) typeWise[exp.type] = 0;
    typeWise[exp.type] += Number(exp.amount);
  });

  res.json({
    grand_total: grandTotal,
    bike_wise: bikeWise,
    type_wise: typeWise
  });
});

// Admin: kisi investor ke liye login account banana
// Investor apna invested paisa wapas leta hai (partial withdrawal)
// Existing investor ke account mein aur paisa add karna
app.post('/investors/:id/deposit', async (req, res) => {
  const { id } = req.params;
  const { amount } = req.body;

  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'Amount zaroori hai' });
  }

  const { data: investor, error: investorError } = await supabase
    .from('investors')
    .select('*')
    .eq('id', id)
    .single();

  if (investorError || !investor) {
    return res.status(404).json({ error: 'Investor nahi mila' });
  }

  const newCashInHand = Number(investor.cash_in_hand) + Number(amount);
  const newTotalInvested = Number(investor.total_invested) + Number(amount);

  const { error: updateError } = await supabase
    .from('investors')
    .update({ cash_in_hand: newCashInHand, total_invested: newTotalInvested })
    .eq('id', id);

  if (updateError) {
    return res.status(500).json({ error: updateError.message });
  }

  await supabase
    .from('investor_deposits')
    .insert({ investor_id: id, amount });

  res.status(201).json({ message: `${investor.name} ke account mein Rs ${amount} add ho gaya` });
});

app.post('/investors/:id/withdraw', async (req, res) => {
  const { id } = req.params;
  const { amount } = req.body;

  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'Amount zaroori hai' });
  }

  const { data: investor, error: investorError } = await supabase
    .from('investors')
    .select('*')
    .eq('id', id)
    .single();

  if (investorError || !investor) {
    return res.status(404).json({ error: 'Investor nahi mila' });
  }

  if (Number(amount) > Number(investor.cash_in_hand)) {
    return res.status(400).json({ error: `Investor ke paas sirf Rs ${investor.cash_in_hand} cash-in-hand hai, itna zyada nahi de saktay` });
  }

  const newCashInHand = Number(investor.cash_in_hand) - Number(amount);
  const newTotalInvested = Number(investor.total_invested) - Number(amount);

  const { error: updateError } = await supabase
    .from('investors')
    .update({ cash_in_hand: newCashInHand, total_invested: newTotalInvested })
    .eq('id', id);

  if (updateError) {
    return res.status(500).json({ error: updateError.message });
  }

  await supabase
    .from('investor_withdrawals')
    .insert({ investor_id: id, amount });

  res.status(201).json({ message: `${investor.name} ko Rs ${amount} wapas de diya` });
});

app.post('/investors/:id/create-login', async (req, res) => {
  const { id } = req.params;
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'email aur password dono chahiye' });
  }

  // Confirm karo yeh investor exist karta hai
  const { data: investor, error: investorError } = await supabase
    .from('investors')
    .select('*')
    .eq('id', id)
    .single();

  if (investorError || !investor) {
    return res.status(404).json({ error: 'Investor nahi mila' });
  }

  // Naya auth user banao (Supabase Admin API, service role key ke through)
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true // taake investor ko email confirm karne ki zaroorat na pade
  });

  if (authError) {
    return res.status(500).json({ error: authError.message });
  }

  // Investor row ko naye auth user se link karo
  const { error: linkError } = await supabase
    .from('investors')
    .update({ auth_user_id: authData.user.id })
    .eq('id', id);

  if (linkError) {
    return res.status(500).json({ error: linkError.message });
  }

  res.status(201).json({ message: `${investor.name} ke liye login ban gaya`, email });
});

// Investor: apna khud ka data dekhna (login ke baad)
app.get('/my/investor', async (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Login zaroori hai' });
  }

  const token = authHeader.replace('Bearer ', '');

  // Token verify karo — yeh confirm karta hai token asli aur valid hai
  const { data: userData, error: userError } = await supabase.auth.getUser(token);

  if (userError || !userData.user) {
    return res.status(401).json({ error: 'Login expire ho gaya, dobara login karo' });
  }

  // Is auth user se linked investor dhoondo
  const { data: investor, error: investorError } = await supabase
    .from('investors')
    .select('*')
    .eq('auth_user_id', userData.user.id)
    .single();

  if (investorError || !investor) {
    return res.status(404).json({ error: 'Is login se koi investor linked nahi hai' });
  }

  // Sirf isi investor ki bikes
  const { data: bikes } = await supabase
    .from('bikes')
    .select('*')
    .eq('investor_id', investor.id)
    .order('created_at', { ascending: false });

  // Sirf isi investor ki profit history
  const { data: saleHistory } = await supabase
    .from('sale_transactions')
    .select('*')
    .eq('investor_id', investor.id)
    .order('date', { ascending: false });

  res.json({ investor, bikes: bikes || [], sale_history: saleHistory || [] });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server chal raha hai port ${PORT} pe`);
});