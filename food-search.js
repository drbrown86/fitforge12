'use strict';

const smartFood = (() => {
  const keys = ['calories', 'protein', 'carbs', 'fat'];
  const longhorn = 'https://media.longhornsteakhouse.com/en_us/pdf/nutrition_allergen_guide.pdf';
  const menu = [
    ['mcd-cheeseburger', "McDonald’s Cheeseburger", '1 burger', [300, 15, 31, 13],
      'https://www.mcdonalds.com/us/en-us/product/cheeseburger.html'],
    ['lh-sirloin-6', 'LongHorn Steakhouse Renegade Sirloin', '6 oz steak', [320, 36, 2, 15], longhorn],
    ['lh-sirloin-8', 'LongHorn Steakhouse Renegade Sirloin', '8 oz steak', [390, 51, 2, 16], longhorn],
    ['lh-filet-6', 'LongHorn Steakhouse Flo’s Filet', '6 oz steak', [330, 37, 2, 15], longhorn],
    ['lh-filet-9', 'LongHorn Steakhouse Flo’s Filet', '9 oz steak', [450, 56, 3, 19], longhorn],
    ['lh-ribeye-12', 'LongHorn Steakhouse Ribeye', '12 oz steak', [810, 66, 4, 54], longhorn],
    ['lh-ribeye-20', 'LongHorn Steakhouse Outlaw Ribeye', '20 oz steak', [1250, 94, 2, 87], longhorn],
  ];
  const normalize = value => value.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ')
    .replace(/cheese burger/g, 'cheeseburger').trim();
  const macros = values => Object.fromEntries(keys.map((key, i) => [key, values[i]]));
  const complete = values => values.every(value => value !== null && value !== '' &&
    Number.isFinite(Number(value)) && Number(value) >= 0);
  const label = food => food.quality === 'verified' ? 'Verified · official restaurant menu' : 'Estimate · ' + food.source;
  let query = '', results = [], message = '', lookup, camera, cameraRequest = 0;
  const amounts = new Map();

  function restaurants(term) {
    const words = normalize(term).split(' ').filter(word => !['a', 'from', 'the', 'at'].includes(word));
    return menu.filter(([, name, serving]) => words.length &&
      words.every(word => normalize(name + ' ' + serving).split(' ').includes(word)))
      .map(([id, name, serving, values, url]) => ({
        id, name, serving, values, url, quality: 'verified', source: 'Official restaurant menu',
      }));
  }

  async function json(url, signal) {
    const response = await fetch(url, {signal});
    if (!response.ok) throw new Error('Lookup unavailable');
    return response.json();
  }

  async function usda(term, signal) {
    const params = new URLSearchParams({query: term, api_key: 'DEMO_KEY', pageSize: '12'});
    for (const type of ['Foundation', 'SR Legacy', 'Survey (FNDDS)']) params.append('dataType', type);
    const data = await json('https://api.nal.usda.gov/fdc/v1/foods/search?' + params, signal);
    return (data.foods || []).flatMap(food => {
      const values = [1008, 1003, 1005, 1004].map(id =>
        food.foodNutrients?.find(nutrient => nutrient.nutrientId === id)?.value);
      if (!food.description || !complete(values)) return [];
      return [{
        id: 'usda-' + food.fdcId, name: food.description, serving: '100 g', values: values.map(Number),
        source: 'USDA FoodData Central', url: 'https://fdc.nal.usda.gov/food-details/' + food.fdcId + '/nutrients',
      }];
    }).slice(0, 6);
  }

  async function openFoodFacts(term, barcode, signal) {
    const fields = 'code,product_name,brands,nutriments,serving_size,serving_quantity';
    async function product(code) {
      const url = 'https://world.openfoodfacts.org/api/v2/product/' + code + '.json?fields=' + fields;
      const response = await fetch(url, {signal});
      if (response.status === 404) return undefined;
      if (!response.ok) throw new Error('Lookup unavailable');
      return (await response.json()).product;
    }

    let products;
    if (barcode) {
      products = [await product(term)];
    } else {
      const params = new URLSearchParams({q: term, page_size: '6'});
      const data = await json('https://search.openfoodfacts.org/search?' + params, signal);
      const codes = [...new Set((data.hits || []).map(hit => hit.code))]
        .filter(code => /^\d{8}$|^\d{12,14}$/.test(code));
      const responses = await Promise.allSettled(codes.map(product));
      products = responses.flatMap(response => response.status === 'fulfilled' ? [response.value] : []);
      if (!products.length && responses.some(response => response.status === 'rejected')) {
        throw new Error('Lookup unavailable');
      }
    }

    return products.flatMap(food => {
      if (!food?.product_name || !food.code) return [];
      const names = ['energy-kcal', 'proteins', 'carbohydrates', 'fat'];
      const perServing = names.map(key => food.nutriments?.[key + '_serving']);
      const hasServing = food.serving_size && Number(food.serving_quantity) > 0 && complete(perServing);
      const serving = hasServing ? food.serving_size : '100 g';
      const values = hasServing ? perServing : names.map(key => food.nutriments?.[key + '_100g']);
      if (!complete(values)) return [];
      return [{
        id: 'off-' + food.code, name: [food.product_name, food.brands].filter(Boolean).join(' · '),
        serving, values: values.map(Number), source: 'Open Food Facts · community data',
        url: 'https://world.openfoodfacts.org/product/' + food.code,
      }];
    }).slice(0, 6);
  }

  function saved(key) {
    return Array.isArray(state[key]) ? state[key] : [];
  }

  function amount(food) {
    return amounts.get(food.id) ?? food.amount ?? '1';
  }

  function adjusted(food, quantity) {
    return food.values.map(value => Math.round(value * quantity * 10) / 10);
  }

  function summary(values) {
    return values.map((value, i) => value + [' kcal', ' g protein', ' g carbs', ' g fat'][i]).join(' · ');
  }

  function paint() {
    const target = document.getElementById('smart-food-results');
    if (!target) return;
    const favorites = saved('foodFavorites');
    const groups = [['Search results', results], ['Favorites', favorites], ['Recent foods', saved('foodRecents')]];
    const indexed = [];
    target.innerHTML = groups.filter(([, foods]) => foods.length).map(([heading, foods]) =>
      '<h3>' + heading + '</h3>' + foods.map(food => {
        const index = indexed.push(food) - 1;
        const isFavorite = favorites.some(item => item.id === food.id);
        const url = typeof food.url === 'string' && /^https:\/\/(www\.mcdonalds\.com|media\.longhornsteakhouse\.com|fdc\.nal\.usda\.gov|world\.openfoodfacts\.org)\//.test(food.url)
          ? '<a class="food-source" href="' + escapeHtml(food.url) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(label(food)) + '</a>'
          : escapeHtml(label(food));
        return `<form class="mealidea smart-result" data-food-index="${index}">
          <strong>${escapeHtml(food.name)}</strong><div class="small muted">${url}</div>
          <label>Servings (${escapeHtml(food.serving)} each)
            <input class="field" type="number" name="quantity" min="0.01" max="100" step="any"
              required value="${escapeHtml(String(amount(food)))}">
          </label>
          <div class="small" data-food-macros>${summary(adjusted(food, Number(amount(food))))}</div>
          <div class="actions"><button class="btn" type="submit">Log food</button>
            <button class="btn secondary" type="button" data-favorite aria-pressed="${isFavorite}">
              ${isFavorite ? 'Remove favorite' : 'Favorite'}
            </button></div>
        </form>`;
      }).join('')).join('');
    target.querySelectorAll('[data-food-index]').forEach(form => {
      const food = indexed[Number(form.dataset.foodIndex)];
      const input = form.elements.quantity;
      input.oninput = () => {
        amounts.set(food.id, input.value);
        form.querySelector('[data-food-macros]').textContent = input.validity.valid ?
          summary(adjusted(food, input.valueAsNumber)) : 'Enter a serving amount from 0.01 to 100.';
      };
      form.onsubmit = event => {
        event.preventDefault();
        if (!input.reportValidity()) return;
        const quantity = input.valueAsNumber;
        state.meals.push({
          id: crypto.randomUUID?.() || Date.now() + '-' + Math.random().toString(36).slice(2),
          date: localDate(), name: food.name, ...macros(adjusted(food, quantity)),
          foodSource: label(food), foodServings: quantity, foodServing: food.serving,
        });
        state.foodRecents = [{...food, amount: String(quantity)},
          ...saved('foodRecents').filter(item => item.id !== food.id)].slice(0, 15);
        save();
        setMessage('Logged ' + food.name + '.');
        render();
        document.getElementById('smart-food-status')?.focus();
      };
      form.querySelector('[data-favorite]').onclick = () => {
        const previous = saved('foodFavorites');
        state.foodFavorites = previous.some(item => item.id === food.id)
          ? previous.filter(item => item.id !== food.id)
          : [{...food, amount: input.validity.valid ? input.value : '1'}, ...previous];
        save();
        paint();
        target.querySelector('[data-food-index="' + form.dataset.foodIndex + '"] [data-favorite]')?.focus();
      };
    });
  }

  function setMessage(value) {
    message = value;
    const status = document.getElementById('smart-food-status');
    if (status) status.textContent = value;
  }

  async function search(term) {
    lookup?.abort();
    query = term.trim();
    if (!query) return;
    const controller = new AbortController();
    lookup = controller;
    const barcode = /^\d{8}$|^\d{12,14}$/.test(query);
    results = barcode ? [] : restaurants(query);
    paint();
    if (results.length) {
      setMessage('Choose the menu item and size you ate.');
      return;
    }
    setMessage('Searching nutrition databases…');
    const timeout = setTimeout(() => controller.abort(), 9000);
    const sources = barcode ? ['Open Food Facts'] : ['USDA FoodData Central', 'Open Food Facts'];
    const requests = barcode ? [openFoodFacts(query, true, controller.signal)] :
      [usda(query, controller.signal), openFoodFacts(query, false, controller.signal)];
    const responses = await Promise.allSettled(requests);
    clearTimeout(timeout);
    if (lookup !== controller) return;
    results = responses.flatMap(result => result.status === 'fulfilled' ? result.value : []);
    const unavailable = sources.filter((_, i) => responses[i].status === 'rejected');
    const notice = results.length ? 'Choose the closest match and check the serving size.' :
      'No complete nutrition match found. You can add the food manually below.';
    setMessage(notice + (unavailable.length ? ' Unavailable: ' + unavailable.join(', ') + '.' : ''));
    paint();
  }

  function stopCamera() {
    cameraRequest++;
    camera?.getTracks().forEach(track => track.stop());
    camera = undefined;
    const panel = document.getElementById('smart-food-camera');
    if (panel) panel.hidden = true;
  }

  async function scan() {
    stopCamera();
    const request = cameraRequest;
    if (!window.BarcodeDetector || !navigator.mediaDevices?.getUserMedia) {
      setMessage('Camera scanning is unavailable in this browser. Enter the barcode in the search field.');
      return;
    }
    const panel = document.getElementById('smart-food-camera');
    panel.hidden = false;
    const video = panel.querySelector('video');
    try {
      const supported = await BarcodeDetector.getSupportedFormats();
      const formats = ['ean_13', 'ean_8', 'upc_a', 'upc_e'].filter(format => supported.includes(format));
      if (!formats.length) throw new Error('Unsupported barcode formats');
      const detector = new BarcodeDetector({formats});
      const stream = await navigator.mediaDevices.getUserMedia({video: {facingMode: {ideal: 'environment'}}});
      if (request !== cameraRequest) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      camera = stream;
      video.srcObject = stream;
      await video.play();
      setMessage('Point the camera at the barcode.');
      const deadline = Date.now() + 30000;
      while (request === cameraRequest && Date.now() < deadline) {
        const [code] = await detector.detect(video);
        if (request !== cameraRequest) return;
        if (code && /^\d{8}$|^\d{12,14}$/.test(code.rawValue)) {
          stopCamera();
          document.querySelector('#smart-food-form input').value = code.rawValue;
          await search(code.rawValue);
          return;
        }
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      if (request === cameraRequest) setMessage('Scan timed out. Try again or enter the barcode.');
    } catch {
      if (request === cameraRequest) setMessage('Camera scanning is unavailable. Enter the barcode in the search field.');
    } finally {
      if (request === cameraRequest) stopCamera();
    }
  }

  function view() {
    return `<section class="card smart-food" aria-labelledby="smart-food-heading">
      <h2 id="smart-food-heading">Smart Food Search</h2>
      <form id="smart-food-form">
        <label>Food name or barcode<input class="field" name="query" required maxlength="120"
          value="${escapeHtml(query)}" placeholder="McDonald’s cheeseburger or LongHorn steak"></label>
        <div class="actions"><button class="btn">Search</button>
          <button class="btn secondary" type="button" id="smart-food-scan">Scan barcode</button></div>
      </form>
      <div id="smart-food-camera" hidden><video playsinline muted></video>
        <button type="button" class="btn secondary" id="smart-food-stop">Stop camera</button></div>
      <p class="small muted" id="smart-food-status" role="status" tabindex="-1">${escapeHtml(message)}</p>
      <div id="smart-food-results"></div>
    </section>`;
  }

  function bind() {
    const form = document.getElementById('smart-food-form');
    if (!form) return;
    form.onsubmit = event => {
      event.preventDefault();
      stopCamera();
      search(form.elements.query.value);
    };
    document.getElementById('smart-food-scan').onclick = scan;
    document.getElementById('smart-food-stop').onclick = () => {
      stopCamera();
      setMessage('Camera stopped.');
    };
    paint();
  }

  window.addEventListener('pagehide', stopCamera);
  return {view, bind, stopCamera};
})();
