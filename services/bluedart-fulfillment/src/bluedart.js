import { config } from './config.js';

let cachedToken = null;
let tokenExpiresAt = 0;

function dotnetDate(date = new Date()) {
  return `/Date(${date.getTime()})/`;
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Blue Dart invalid JSON (${res.status}): ${text.slice(0, 300)}`);
  }
  if (!res.ok) {
    const msg =
      data?.['error-response']?.[0]?.Status?.[0]?.StatusInformation ||
      data?.['error-response']?.[0]?.msg ||
      data?.title ||
      text.slice(0, 300);
    throw new Error(`Blue Dart ${res.status}: ${msg}`);
  }
  return data;
}

export async function getShippingJwt(force = false) {
  const now = Date.now();
  if (!force && cachedToken && now < tokenExpiresAt - 60_000) {
    return cachedToken;
  }

  const { loginId, password, shippingLicenceKey } = config.bluedart;
  const qs = new URLSearchParams({
    LoginID: loginId,
    Password: password,
    LicenceKey: shippingLicenceKey,
  });

  const data = await fetchJson(
    `${config.bluedart.baseUrl}/token/v1/login?${qs}`,
    { method: 'GET' }
  );

  if (!data?.JWTToken) {
    throw new Error('Blue Dart auth failed: no JWTToken in response');
  }

  cachedToken = data.JWTToken;
  tokenExpiresAt = now + 23 * 60 * 60 * 1000;
  return cachedToken;
}

export async function getTrackingJwt() {
  const { loginId, password, trackingLicenceKey } = config.bluedart;
  const qs = new URLSearchParams({
    LoginID: loginId,
    Password: password,
    LicenceKey: trackingLicenceKey || config.bluedart.shippingLicenceKey,
  });

  const data = await fetchJson(
    `${config.bluedart.baseUrl}/token/v1/login?${qs}`,
    { method: 'GET' }
  );

  if (!data?.JWTToken) {
    throw new Error('Blue Dart tracking auth failed');
  }
  return data.JWTToken;
}

export async function checkPincodeServiceability(pincode) {
  const jwt = await getShippingJwt();
  const body = {
    pinCode: String(pincode),
    profile: {
      Api_type: 'S',
      LicenceKey: config.bluedart.shippingLicenceKey,
      LoginID: config.bluedart.loginId,
    },
  };

  const data = await fetchJson(
    `${config.bluedart.baseUrl}/finder/v1/GetServicesforPincode`,
    {
      method: 'POST',
      headers: { JWTToken: jwt, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );

  return data?.GetServicesforPincodeResult ?? data;
}

/** Blue Dart ItemID max length is 15 characters */
function blueDartItemId(value, index) {
  const raw = String(value || '').trim();
  if (raw && raw.length <= 15) return raw;
  if (raw) return raw.slice(0, 15);
  return `GH${String(index + 1).padStart(3, '0')}`.slice(0, 15);
}

export function buildWaybillPayload({ orderRef, consignee, weightKg, declaredValue, codAmount = 0, lineItems = [] }) {
  const { bluedart } = config;
  const pickupDate = dotnetDate(new Date(Date.now() + 24 * 60 * 60 * 1000));

  const itemdtl =
    lineItems.length > 0
      ? lineItems.map((item, index) => ({
          ItemID: blueDartItemId(item.sku || item.id, index),
          ItemName: (item.title || 'Product').slice(0, 50),
          Itemquantity: item.quantity || 1,
          ItemValue: item.price || 0,
        }))
      : [
          {
            ItemID: blueDartItemId(orderRef, 0),
            ItemName: 'Grosyhub Order',
            Itemquantity: 1,
            ItemValue: declaredValue,
          },
        ];

  const creditRef = String(orderRef).replace('#', '').slice(0, 20);

  return {
    Request: {
      Consignee: {
        ConsigneeName: consignee.name,
        ConsigneeAddress1: consignee.address1,
        ConsigneeAddress2: consignee.address2 || '',
        ConsigneeAddress3: consignee.city || '',
        ConsigneePincode: String(consignee.pincode),
        ConsigneeMobile: consignee.mobile,
        ConsigneeEmailID: consignee.email || '',
      },
      Returnadds: {
        ReturnAddress1: bluedart.shipper.address1,
        ReturnAddress2: bluedart.shipper.address2,
        ReturnPincode: bluedart.shipper.pincode,
        ReturnMobile: bluedart.shipper.mobile,
      },
      Services: {
        ActualWeight: String(Math.max(0.1, weightKg).toFixed(2)),
        CreditReferenceNo: creditRef,
        DeclaredValue: declaredValue,
        CollectableAmount: codAmount,
        Dimensions: [{ Length: 10, Breadth: 10, Height: 10, Count: 1 }],
        ItemCount: itemdtl.length,
        PieceCount: '1',
        PickupDate: pickupDate,
        PickupTime: '1400',
        PickupType: 'O',
        ProductCode: bluedart.productCode,
        SubProductCode: bluedart.subProductCode,
        ProductType: 2,
        PDFOutputNotRequired: false,
        RegisterPickup: false,
        Commodity: { CommodityDetail1: 'Grosyhub parcel' },
        itemdtl,
      },
      Shipper: {
        CustomerName: bluedart.shipper.name,
        CustomerAddress1: bluedart.shipper.address1,
        CustomerAddress2: bluedart.shipper.address2,
        CustomerAddress3: bluedart.shipper.address3,
        CustomerPincode: bluedart.shipper.pincode,
        CustomerMobile: bluedart.shipper.mobile,
        CustomerEmailID: bluedart.shipper.email,
        CustomerCode: bluedart.customerCode,
        OriginArea: bluedart.originArea,
        IsToPayCustomer: false,
      },
    },
    Profile: {
      Api_type: 'S',
      Area: bluedart.originArea,
      Customercode: bluedart.customerCode,
      LicenceKey: bluedart.shippingLicenceKey,
      LoginID: bluedart.loginId,
      Version: bluedart.version,
    },
  };
}

export async function generateWaybill(payload) {
  const jwt = await getShippingJwt();
  const data = await fetchJson(
    `${config.bluedart.baseUrl}/waybill/v1/GenerateWayBill`,
    {
      method: 'POST',
      headers: { JWTToken: jwt, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );

  const result = data?.GenerateWayBillResult ?? data;
  if (result?.IsError) {
    const info =
      result?.Status?.[0]?.StatusInformation ||
      result?.ErrorMessage ||
      'Waybill generation failed';
    throw new Error(info);
  }

  return {
    awb: result?.AWBNo || result?.AWBNumber || result?.WayBillNo,
    pdfBase64: result?.AWBPrintContent || result?.AWBLabel || null,
    raw: result,
  };
}

export async function trackShipment(awb) {
  const jwt = await getTrackingJwt();
  const { loginId, trackingLicenceKey, version } = config.bluedart;
  const qs = new URLSearchParams({
    handler: 'tnt',
    action: 'custawbquery',
    loginid: loginId,
    awb: 'awb',
    numbers: String(awb),
    format: 'json',
    lickey: trackingLicenceKey || config.bluedart.shippingLicenceKey,
    verno: version,
    scan: '1',
  });

  const res = await fetch(`${config.bluedart.baseUrl}/tracking/v1?${qs}`, {
    headers: { JWTToken: jwt },
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

export function trackingUrl(awb) {
  return `https://www.bluedart.com/web/guest/trackdartresult?trackFor=0&trackNo=${encodeURIComponent(awb)}`;
}
