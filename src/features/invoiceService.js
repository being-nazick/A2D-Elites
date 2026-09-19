import logo1 from "./assets/logo1.png";
import signatureImg from "./assets/signature.png";
import html2pdf from "html2pdf.js";
import qrImg from "./assets/payment-qr.png";
// import { ThemeProvider, useTheme } from "./app/ThemeContext";

import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import {
  C,

  BUSINESS_NAME,
  BUSINESS_TAGLINE,
  BUSINESS_ADDRESS,
  BUSINESS_PHONE,
  BUSINESS_EMAIL,
  UPI_ID,
  UPI_PAYEE_NAME,
} from "./app/constants";
import {
  todayStr,
  fmtINR,
  fmtDate,
} from "./app/helpers";
/* ============================== PDF / BILL GENERATION ============================== */

/* -------------------------------------------------------------------------- */
/* HELPERS                                                                    */
/* -------------------------------------------------------------------------- */

async function waitForInvoiceImages(container) {
  const images = Array.from(container.querySelectorAll("img"));
  if (!images.length) return;

  await Promise.all(
    images.map((img) => {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve();
      return new Promise((resolve) => {
        img.onload = () => resolve();
        img.onerror = () => resolve();
      });
    }),
  );
}

async function waitForInvoiceRender() {
  await new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  });

  if (document.fonts && document.fonts.ready) {
    try {
      await document.fonts.ready;
    } catch (_) {}
  }
}

/* -------------------------------------------------------------------------- */
/* OPTION A MARKUP (PRESERVED CONTENT & STRUCTURE)                            */
/* -------------------------------------------------------------------------- */

function buildBillMarkup(order, allOrders = [], customers = []) {
  const _fmtINR =
    typeof fmtINR === "function"
      ? fmtINR
      : (v) => `₹${Number(v || 0).toFixed(2)}`;

  const _fmtDate =
    typeof fmtDate === "function"
      ? fmtDate
      : (d) => d || new Date().toISOString().split("T")[0];

  const _todayStr =
    typeof todayStr === "function"
      ? todayStr()
      : new Date().toISOString().split("T")[0];

  const bizName =
    typeof BUSINESS_NAME !== "undefined" ? BUSINESS_NAME : "A2D'Elites";

  const bizTagline =
    typeof BUSINESS_TAGLINE !== "undefined" ? BUSINESS_TAGLINE : "SINCE 2025";

  const bizAddress =
    typeof BUSINESS_ADDRESS !== "undefined" ? BUSINESS_ADDRESS : "";

  const bizPhone = typeof BUSINESS_PHONE !== "undefined" ? BUSINESS_PHONE : "";

  const bizEmail = typeof BUSINESS_EMAIL !== "undefined" ? BUSINESS_EMAIL : "";

  const colors = typeof C !== "undefined" ? C : {};

  const sigImg = typeof signatureImg !== "undefined" ? signatureImg : "";

  /* ---------------------------------------------------------------------- */
  /* CUSTOMER                                                               */
  /* ---------------------------------------------------------------------- */

  const customer =
    customers?.find((c) => String(c.id) === String(order.customerId)) || null;

  const deliveryAddress =
    customer?.address || order.customerAddress || order.address || "—";

  const contactPhone = customer?.phone || order.phone || "—";

  /* ---------------------------------------------------------------------- */
  /* CURRENT INVOICE                                                        */
  /* ---------------------------------------------------------------------- */

  const totalAmount =
    Number(order.total) ||
    (order.items || []).reduce(
      (sum, it) => sum + (Number(it.qty) || 0) * (Number(it.price) || 0),
      0,
    );

  const amountPaid = Number(order.amountPaid) || 0;

  const balanceDue = Math.max(0, totalAmount - amountPaid);

  const totalQty = (order.items || []).reduce(
    (sum, item) => sum + (Number(item.qty) || 0),
    0,
  );

  /* ---------------------------------------------------------------------- */
  /* CUMULATIVE BALANCE                                                     */
  /* ---------------------------------------------------------------------- */

  /*
   * IMPORTANT:
   *
   * The `order` argument is treated as the CURRENT invoice.
   *
   * We calculate previous outstanding from previous orders,
   * then add the current invoice balance exactly once.
   */

  const currentOrderId = String(order.id);

  const previousOrders = (allOrders || [])
    .filter(
      (o) =>
        String(o.customerId) === String(order.customerId) &&
        String(o.id) !== currentOrderId &&
        o.orderStatus !== "Cancelled",
    )
    .sort((a, b) => {
      const dateA = new Date(a.orderDate || 0).getTime();

      const dateB = new Date(b.orderDate || 0).getTime();

      if (dateA !== dateB) {
        return dateA - dateB;
      }

      return String(a.id).localeCompare(String(b.id));
    });

  /*
   * Sum outstanding balances from ALL previous orders.
   */
  const previousOutstanding = previousOrders.reduce((sum, previousOrder) => {
    const previousTotal =
      Number(previousOrder.total) ||
      (previousOrder.items || []).reduce(
        (itemSum, item) =>
          itemSum + (Number(item.qty) || 0) * (Number(item.price) || 0),
        0,
      );

    const previousPaid = Number(previousOrder.amountPaid) || 0;

    const previousDue = Math.max(0, previousTotal - previousPaid);

    return sum + previousDue;
  }, 0);

  /*
   * FINAL cumulative balance:
   *
   * Previous outstanding
   * +
   * Current invoice outstanding
   */
  const totalCumulativeBalance = previousOutstanding + balanceDue;

  /* ---------------------------------------------------------------------- */
  /* BOTTLE BALANCE                                                         */
  /* ---------------------------------------------------------------------- */

  const pastBottles = (allOrders || [])
    .filter(
      (o) =>
        String(o.customerId) === String(order.customerId) &&
        String(o.id) !== currentOrderId &&
        o.orderStatus !== "Cancelled",
    )
    .reduce((sum, o) => {
      const delivered = (o.items || [])
        .filter((it) => it.category === "Milk")
        .reduce((s, it) => s + (Number(it.qty) || 0), 0);

      const returned = Number(o.bottlesReturned) || 0;

      return sum + Math.max(0, delivered - returned);
    }, 0);

  const currentDelivered = (order.items || [])
    .filter((it) => it.category === "Milk")
    .reduce((s, it) => s + (Number(it.qty) || 0), 0);

  const currentReturned = Number(order.bottlesReturned) || 0;

  const totalRemainingBottles = Math.max(
    0,
    pastBottles + currentDelivered - currentReturned,
  );

  /* ---------------------------------------------------------------------- */
  /* INVOICE NUMBER                                                         */
  /* ---------------------------------------------------------------------- */

  const invoiceNo =
    order.invoiceNo ||
    `INV-${String(order.id || "XXXXX")
      .toUpperCase()
      .slice(-6)}`;

  /* ---------------------------------------------------------------------- */
  /* MARKUP                                                                 */
  /* ---------------------------------------------------------------------- */

  return `
    <div
      style="
        font-family: sans-serif;
        font-size: 11px;
        color: #111;
        background: #fff;
        padding: 20px;
        width: 703px;
        margin: 0 auto;
        box-sizing: border-box;
        border: 1px solid ${colors.paperLine || "#ddd"};
        border-radius: 8px;
      "
    >
<!-- HEADER -->
<div
  style="
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 2px solid #111;
    padding-bottom: 12px;
    margin-bottom: 12px;
  "
>
  <!-- LEFT: LOGO + BUSINESS DETAILS -->
  <div
    style="
      display: flex;
      align-items: center;
      gap: 12px;
    "
  >
    <!-- LOGO -->
    <div
      style="
        width: 60px;
        height: 60px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      "
    >
      <img
        src="${logo1}"
        alt="Business Logo"
        style="
          width: 60px;
          height: 60px;
          object-fit: contain;
        "
      />
    </div>

    <!-- BUSINESS DETAILS -->
    <div>
      <h1
        style="
          font-size: 16px;
          font-weight: 800;
          margin: 0;
          text-transform: uppercase;
        "
      >
        ${bizName}
      </h1>

      <div
        style="
          font-size: 9px;
          color: #555;
          text-transform: uppercase;
        "
      >
        ${bizTagline}
      </div>

      <div
        style="
          font-size: 9px;
          color: #444;
          margin-top: 4px;
          line-height: 1.3;
        "
      >
        ${bizAddress ? `<div>${bizAddress}</div>` : ""}

        ${
          bizPhone || bizEmail
            ? `<div>
                Ph: ${bizPhone}
                ${bizEmail ? `| ${bizEmail}` : ""}
              </div>`
            : ""
        }
      </div>
    </div>
  </div>

  <!-- RIGHT: INVOICE -->
  <div style="text-align: right;">
    <h2
      style="
        font-size: 18px;
        margin: 0;
        font-weight: 900;
        letter-spacing: 1px;
      "
    >
      INVOICE
    </h2>

    <span
      style="
        display: inline-block;
        background: #eee;
        border: 1px solid #ccc;
        font-size: 8px;
        font-weight: 700;
        padding: 2px 6px;
        margin-top: 4px;
      "
    >
      ${order.copyType || "ORIGINAL"}
    </span>
  </div>
</div>


      <!-- CUSTOMER / META -->
      <div
        style="
          display: flex;
          justify-content: space-between;
          margin-bottom: 14px;
          font-size: 10px;
        "
      >
        <div style="width: 55%;">
          <div
            style="
              font-weight: 700;
              text-transform: uppercase;
              color: #666;
              margin-bottom: 2px;
            "
          >
            Billing Address:
          </div>

          <div
            style="
              font-weight: 700;
              font-size: 11px;
            "
          >
            ${order.customerName || customer?.name || "—"}
          </div>

          <div
            style="
              color: #333;
              line-height: 1.3;
            "
          >
            ${deliveryAddress}
          </div>

          <div
            style="
              color: #333;
              margin-top: 2px;
            "
          >
            Ph: ${contactPhone}
          </div>
        </div>

        <div
          style="
            width: 40%;
            text-align: right;
            line-height: 1.4;
          "
        >
          <div>
            <b>Invoice #:</b> ${invoiceNo}
          </div>

          <div>
            <b>Invoice Date:</b>
            ${_fmtDate(_todayStr)}
          </div>

          <div>
            <b>Order Date:</b>
            ${_fmtDate(order.orderDate || _todayStr)}
          </div>
        </div>
      </div>

      <!-- ITEMS -->
      <table
        style="
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 12px;
          font-size: 10px;
        "
      >
        <thead>
          <tr
            style="
              background: #f4f4f4;
              border-top: 1px solid #111;
              border-bottom: 1px solid #111;
              text-align: left;
            "
          >
            <th style="padding: 6px; width: 5%;">
              #
            </th>

            <th style="padding: 6px;">
              Item
            </th>

            <th
              style="
                padding: 6px;
                text-align: right;
              "
            >
              Rate
            </th>

            <th
              style="
                padding: 6px;
                text-align: center;
              "
            >
              Qty
            </th>

            <th
              style="
                padding: 6px;
                text-align: right;
              "
            >
              Amount
            </th>
          </tr>
        </thead>

        <tbody>

          ${(order.items || [])
            .map(
              (it, idx) => `
                <tr
                  style="
                    border-bottom: 1px solid #eee;
                  "
                >
                  <td style="padding: 6px;">
                    ${idx + 1}
                  </td>

                  <td
                    style="
                      padding: 6px;
                      font-weight: 600;
                    "
                  >
                    ${it.productName || it.name || "Item"}
                  </td>

                  <td
                    style="
                      padding: 6px;
                      text-align: right;
                    "
                  >
                    ${_fmtINR(it.price || 0)}
                  </td>

                  <td
                    style="
                      padding: 6px;
                      text-align: center;
                    "
                  >
                    ${it.qty || 0}
                    ${it.unit || "PCS"}
                  </td>

                  <td
                    style="
                      padding: 6px;
                      text-align: right;
                      font-weight: 600;
                    "
                  >
                    ${_fmtINR((Number(it.qty) || 0) * (Number(it.price) || 0))}
                  </td>
                </tr>
              `,
            )
            .join("")}

          <!-- SUBTOTAL -->
          <tr
            style="
              border-top: 1px solid #111;
              font-weight: 600;
            "
          >
            <td
              colspan="4"
              style="
                padding: 6px;
                text-align: right;
              "
            >
              Subtotal
            </td>

            <td
              style="
                padding: 6px;
                text-align: right;
              "
            >
              ${_fmtINR(totalAmount)}
            </td>
          </tr>

          <!-- PAID -->
          ${
            amountPaid > 0
              ? `
                <tr style="color: #2e7d32;">
                  <td
                    colspan="4"
                    style="
                      padding: 4px 6px;
                      text-align: right;
                    "
                  >
                    Amount Paid
                  </td>

                  <td
                    style="
                      padding: 4px 6px;
                      text-align: right;
                    "
                  >
                    ${_fmtINR(amountPaid)}
                  </td>
                </tr>
              `
              : ""
          }

          <!-- CURRENT BALANCE -->
          <tr
            style="
              border-top: 1px solid #111;
              font-weight: 700;
              font-size: 11px;
            "
          >
            <td
              colspan="4"
              style="
                padding: 6px;
                text-align: right;
              "
            >
              Balance Due (This Invoice)
            </td>

            <td
              style="
                padding: 6px;
                text-align: right;
              "
            >
              ${_fmtINR(balanceDue)}
            </td>
          </tr>

          <!-- PREVIOUS OUTSTANDING -->
          ${
            previousOutstanding > 0
              ? `
                <tr>
                  <td
                    colspan="4"
                    style="
                      padding: 4px 6px;
                      text-align: right;
                      color: #555;
                    "
                  >
                    Previous Outstanding Balance
                  </td>

                  <td
                    style="
                      padding: 4px 6px;
                      text-align: right;
                      color: #555;
                    "
                  >
                    ${_fmtINR(previousOutstanding)}
                  </td>
                </tr>
              `
              : ""
          }

          <!-- CUMULATIVE -->
          <tr
            style="
              border-top: 2px solid #111;
              font-weight: 800;
              font-size: 12px;
              background: #fafafa;
            "
          >
            <td
              colspan="4"
              style="
                padding: 8px 6px;
                text-align: right;
              "
            >
              Total Cumulative Balance Due
            </td>

            <td
              style="
                padding: 8px 6px;
                text-align: right;
                color: ${totalCumulativeBalance > 0 ? "#d32f2f" : "#2e7d32"};
              "
            >
              ${_fmtINR(totalCumulativeBalance)}
            </td>
          </tr>

        </tbody>
      </table>

      <!-- SUMMARY -->
      <div
        style="
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 10px;
          margin-bottom: 14px;
          border-bottom: 1px dashed #ccc;
          padding-bottom: 8px;
        "
      >
        <div>
          <b>Total Items:</b>
          ${order.items ? order.items.length : 0}
          (${totalQty} Qty)
        </div>

        <div
          style="
            background: ${colors.goldSoft || "#fff8e1"};
            border: 1px solid #ffe082;
            padding: 4px 8px;
            border-radius: 4px;
            font-weight: 700;
            color: ${colors.primaryDark || "#000"};
          "
        >
          🍼 Bottles Due:
          ${totalRemainingBottles}
        </div>
      </div>

      <!-- BANK / QR -->
      <div
        style="
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 14px;
          gap: 12px;
        "
      >
        <div
          style="
            width: 50%;
            font-size: 9px;
            line-height: 1.4;
          "
        >
          <div
            style="
              font-weight: 700;
              text-transform: uppercase;
              margin-bottom: 4px;
            "
          >
            Bank Details:
          </div>

          <div>
            <b>Bank:</b>
            ${order.bankName || "Indian Bank"}
          </div>

          <div>
            <b>Holder:</b>
            ${order.accountHolder || "Deena Dhayalan R"}
          </div>

          <div>
            <b>A/C:</b>
            ${order.accountNumber || "7084125477"}
          </div>

          <div>
            <b>IFSC:</b>
            ${order.ifscCode || "IDIB000M206"}
          </div>
        </div>

        <div
          style="
            width: 45%;
            display: flex;
            align-items: center;
            justify-content: flex-end;
            gap: 10px;
          "
        >
          ${
            typeof qrImg !== "undefined" && qrImg
              ? `
                <div style="text-align: center;">
                  <img
                    src="${qrImg}"
                    style="
                      width: 70px;
                      height: 70px;
                      object-fit: contain;
                      border: 1px solid #ddd;
                      padding: 2px;
                      border-radius: 4px;
                    "
                    alt="Payment QR"
                  />

                  <div
                    style="
                      font-size: 7px;
                      color: #555;
                      margin-top: 2px;
                      font-weight: 600;
                    "
                  >
                    Scan to Pay
                  </div>
          ${UPI_ID} || ${UPI_PAYEE_NAME}
        
                </div>
              `
              : ""
          }

          <div
            style="
              background: #fff8e1;
              border: 1px solid #ffe082;
              padding: 8px 12px;
              border-radius: 4px;
              text-align: center;
              min-width: 110px;
            "
          >
            <div
              style="
                font-size: 8px;
                text-transform: uppercase;
                color: #555;
                font-weight: 700;
              "
            >
              Total Outstanding
            </div>

            <div
              style="
                font-size: 15px;
                font-weight: 800;
                color: ${totalCumulativeBalance > 0 ? "#d32f2f" : "#2e7d32"};
                margin-top: 2px;
              "
            >
              ${_fmtINR(totalCumulativeBalance)}
            </div>
          </div>
        </div>
      </div>

      <!-- FOOTER -->
      <div
        style="
          text-align: center;
          border-top: 1px solid #111;
          padding-top: 8px;
          margin-top: 10px;
        "
      >
        <div
          style="
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 4px;
          "
        >
          ${
            sigImg
              ? `
                <img
                  src="${sigImg}"
                  style="
                    height: 35px;
                    max-width: 100px;
                    object-fit: contain;
                  "
                  onError="this.style.display='none'"
                  alt="Signature"
                />
              `
              : ""
          }

          <div
            style="
              font-size: 8px;
              color: #555;
            "
          >
            For <b>${bizName}</b>
          </div>

          <div
            style="
              border-top: 1px solid #888;
              padding-top: 2px;
              font-weight: 600;
              font-size: 8px;
              width: 120px;
            "
          >
            Authorized Signatory
          </div>
        </div>
      </div>

    </div>
  `;
}

/* -------------------------------------------------------------------------- */
/* GENERATE BILL (OPTION B EXECUTION ENGINE)                                  */
/* -------------------------------------------------------------------------- */

async function generateBill(order, allOrders = [], customers = []) {
  let el = null;

  try {
    if (!order || typeof order !== "object") {
      throw new Error("Invalid order data provided.");
    }

    // 1. Create container matching Option B DOM rendering strategy
    el = document.createElement("div");
    el.style.position = "relative";
    el.style.width = "703px";
    el.style.minHeight = "auto";
    el.style.margin = "0";
    el.style.padding = "0";
    el.style.background = "#ffffff";
    el.style.pointerEvents = "none";

    el.innerHTML = buildBillMarkup(order, allOrders, customers);
    document.body.appendChild(el);

    // 2. Wait for layout, fonts, and signature images to load
    await waitForInvoiceRender();
    await waitForInvoiceImages(el);

    const invoiceNumber =
      order.invoiceNo ||
      `INV-${String(order.id || "XXXXX")
        .toUpperCase()
        .slice(-6)}`;
    const filename = `Invoice_${invoiceNumber}.pdf`;

    // 3. Option B PDF configuration options
    const options = {
      margin: [8, 8, 8, 8],
      filename,
      image: {
        type: "jpeg",
        quality: 0.98,
      },
      html2canvas: {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        logging: false,
        backgroundColor: "#ffffff",
        imageTimeout: 15000,
        scrollX: 0,
        scrollY: 0,
      },
      jsPDF: {
        unit: "mm",
        format: [210, 222.75],
        orientation: "portrait",
        compress: true,
      },
      pagebreak: {
        mode: ["avoid-all", "css", "legacy"],
        avoid: ["div", "tr", "img"],
      },
    };

    // 4. Generate PDF output URI string
    const pdfDataUri = await html2pdf()
      .set(options)
      .from(el)
      .outputPdf("datauristring");

    const commaIndex = pdfDataUri.indexOf(",");
    if (commaIndex === -1) {
      throw new Error("Unable to generate PDF data.");
    }
    const base64Data = pdfDataUri.slice(commaIndex + 1);

    // 5. Cross-platform handling (Mobile Native vs Desktop Browser)
    const isCapacitor =
      typeof window !== "undefined" && window.Capacitor?.isNativePlatform?.();

    if (isCapacitor) {
      const file = await Filesystem.writeFile({
        path: filename,
        data: base64Data,
        directory: Directory.Cache,
        recursive: true,
      });

      try {
        await Share.share({
          title: "Tax Invoice",
          text: `Invoice #${invoiceNumber} from ${typeof BUSINESS_NAME !== "undefined" ? BUSINESS_NAME : "A2D'Elites"}`,
          url: file.uri,
          dialogTitle: "Share Invoice PDF",
        });
      } catch (shareError) {
        console.warn("Sharing cancelled or failed:", shareError);
      }
    } else {
      const link = document.createElement("a");
      link.href = pdfDataUri;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
    }
  } catch (err) {
    console.error("PDF Generation Error:", err);
    alert(
      err?.message ||
        "Failed to generate PDF invoice. Falling back to print mode.",
    );
    openPrintable(order, allOrders, customers);
  } finally {
    if (el && el.parentNode) {
      el.parentNode.removeChild(el);
    }
  }
}
function openPrintable(order, allOrders = [], customers = []) {
  const billMarkup = buildBillMarkup(order, allOrders, customers);

  const printWindow = window.open("", "_blank");

  if (!printWindow) {
    alert("Please allow popups to print the invoice.");
    return;
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Invoice</title>

        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0"
        >

        <style>
          body {
            margin: 0;
            padding: 10px;
            background: #fff;
          }

          @media print {
            body {
              padding: 0;
            }
          }
        </style>
      </head>

      <body>
        ${billMarkup}
      </body>
    </html>
  `);

  printWindow.document.close();

  printWindow.onload = () => {
    printWindow.focus();
    printWindow.print();
  };
}

export { generateBill, openPrintable };