import html2pdf from "html2pdf.js"; 
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { 
  BUSINESS_NAME, 
  BUSINESS_TAGLINE, 
  BUSINESS_ADDRESS, 
  BUSINESS_PHONE, 
  BUSINESS_EMAIL, 
  C, 
} from "./app/constants"; 
import { 
  fmtINR, 
  fmtDateShort, 
  monthKey, 
  amountDue, 
  orderTotal, 
} from "./app/helpers";

/* ========================================================================= 
   BILL HISTORY SERVICE 
   Consolidated monthly statements & ledger generation 
========================================================================= */

/* -------------------------------------------------------------------------- 
   HELPERS 
-------------------------------------------------------------------------- */

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
    }) 
  ); 
}

/* -------------------------------------------------------------------------- 
   MONTHLY SUMMARY CALCULATION 
-------------------------------------------------------------------------- */

/**
 * Groups a customer's orders into monthly summaries.
 * Returns an array of month objects sorted newest-first.
 */ 
export function getMonthlySummaries(customerId, allOrders, customerName = "") { 
  const cIdStr = customerId ? String(customerId) : "";
  const cNameStr = customerName ? String(customerName).toLowerCase().trim() : "";

  const customerOrders = (allOrders || []).filter((o) => {
    if (o.orderStatus === "Cancelled") return false;
    const matchId = Boolean(cIdStr && String(o.customerId) === cIdStr);
    const matchName = Boolean(cNameStr && o.customerName && String(o.customerName).toLowerCase().trim() === cNameStr);
    return matchId || matchName;
  });
  
  // Group by month key (YYYY-MM) 
  const grouped = {}; 
  customerOrders.forEach((order) => { 
    const mk = monthKey(order.orderDate); 
    if (!grouped[mk]) { 
      grouped[mk] = { 
        monthKey: mk, 
        orders: [], 
        totalSales: 0, 
        totalPaid: 0, 
        totalPending: 0, 
        totalBottlesSent: 0, 
        totalBottlesReturned: 0, 
      }; 
    } 
    grouped[mk].orders.push(order);

    const total = Number(order.total) || orderTotal(order.items || []);
    grouped[mk].totalSales += total;

    // Prefer customAmount (set via Delivery Modal) over raw amountPaid
    const paid =
      order.customAmount !== undefined && order.customAmount !== null
        ? Number(order.customAmount) || 0
        : order.paymentStatus === "Paid"
          ? total
          : Number(order.amountPaid) || 0;
    grouped[mk].totalPaid += paid;
    grouped[mk].totalPending += amountDue(order);

    const milkQty = (order.items || [])
      .filter((it) => it.category === "Milk")
      .reduce((s, it) => s + (Number(it.qty) || 0), 0);
    grouped[mk].totalBottlesSent += milkQty;
    grouped[mk].totalBottlesReturned += Number(order.bottlesReturned) || 0;
  });

  // Convert to array and sort newest-first 
  const summaries = Object.values(grouped).sort((a, b) => 
    b.monthKey.localeCompare(a.monthKey) 
  );

  return summaries; 
}

/* -------------------------------------------------------------------------- 
   MONTHLY STATEMENT MARKUP 
-------------------------------------------------------------------------- */

function buildMonthlyStatementMarkup(customer, monthSummary, allOrders) { 
  const mk = monthSummary.monthKey; 
  const [year, month] = mk.split("-").map(Number); 
  const monthName = new Date(year, month - 1, 1).toLocaleString("default", { 
    month: "long", 
    year: "numeric", 
  });

  const totalSales = monthSummary.totalSales; 
  const totalPaid = monthSummary.totalPaid; 
  const totalPending = monthSummary.totalPending; 
  const bottlesBalance = Math.max( 
    0, 
    monthSummary.totalBottlesSent - monthSummary.totalBottlesReturned 
  );

  // Sort orders oldest-first for ledger display 
  const ledgerOrders = [...monthSummary.orders].sort((a, b) => 
    (a.orderDate || "").localeCompare(b.orderDate || "") 
  );

  // Calculate cumulative balance running through the month 
  let runningBalance = 0; 
  const balanceMap = {}; 
  ledgerOrders.forEach((o) => { 
    runningBalance += amountDue(o); 
    balanceMap[o.id] = runningBalance; 
  });

  return `
    <div style=" font-family: sans-serif; font-size: 11px; color: #111; background: #fff; padding: 24px; width: 703px; margin: 0 auto; box-sizing: border-box; border: 1px solid ${C.paperLine || "#ddd"}; border-radius: 8px; ">
      <!-- HEADER -->
      <div style="
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        border-bottom: 2px solid #111;
        padding-bottom: 12px;
        margin-bottom: 12px;
      ">
        <div>
          <h1 style="
            font-size: 16px;
            font-weight: 800;
            margin: 0;
            text-transform: uppercase;
          ">${BUSINESS_NAME}</h1>
          <div style="font-size: 9px; color: #555; text-transform: uppercase;">
            ${BUSINESS_TAGLINE}
          </div>
          <div style="font-size: 9px; color: #444; margin-top: 4px; line-height: 1.3;">
            ${BUSINESS_ADDRESS || ""}<br>
            Ph: ${BUSINESS_PHONE || ""} | ${BUSINESS_EMAIL || ""}
          </div>
        </div>
        <div style="text-align: right;">
          <h2 style="
            font-size: 16px;
            margin: 0;
            font-weight: 900;
            letter-spacing: 1px;
          ">MONTHLY STATEMENT</h2>
          <span style="
            display: inline-block;
            background: #eee;
            border: 1px solid #ccc;
            font-size: 8px;
            font-weight: 700;
            padding: 2px 6px;
            margin-top: 4px;
          ">${monthName.toUpperCase()}</span>
        </div>
      </div>

      <!-- CUSTOMER INFO -->
      <div style="
        display: flex;
        justify-content: space-between;
        margin-bottom: 14px;
        font-size: 10px;
        border-bottom: 1px dashed #ccc;
        padding-bottom: 10px;
      ">
        <div>
          <div style="font-weight: 700; text-transform: uppercase; color: #666; margin-bottom: 2px;">
            Customer:
          </div>
          <div style="font-weight: 700; font-size: 12px;">
            ${customer?.name || "—"}
          </div>
          <div style="color: #333; line-height: 1.3;">
            Ph: ${customer?.phone || "—"}<br>
            ${customer?.address || ""}
          </div>
        </div>
        <div style="text-align: right;">
          <div><b>Statement Period:</b> ${monthName}</div>
          <div><b>Total Orders:</b> ${monthSummary.orders.length}</div>
        </div>
      </div>

      <!-- SUMMARY CARDS -->
      <div style="display: flex; gap: 8px; margin-bottom: 14px;">
        <div style="flex: 1; background: #f9f9f9; border: 1px solid #eee; padding: 8px; border-radius: 4px;">
          <div style="font-size: 8px; text-transform: uppercase; color: #666; font-weight: 700;">Total Sales</div>
          <div style="font-size: 14px; font-weight: 800; color: #111;">${fmtINR(totalSales)}</div>
        </div>
        <div style="flex: 1; background: #f0f7f0; border: 1px solid #c8e6c9; padding: 8px; border-radius: 4px;">
          <div style="font-size: 8px; text-transform: uppercase; color: #2e7d32; font-weight: 700;">Paid</div>
          <div style="font-size: 14px; font-weight: 800; color: #2e7d32;">${fmtINR(totalPaid)}</div>
        </div>
        <div style="flex: 1; background: #fff5f5; border: 1px solid #ffcdd2; padding: 8px; border-radius: 4px;">
          <div style="font-size: 8px; text-transform: uppercase; color: #c62828; font-weight: 700;">Pending</div>
          <div style="font-size: 14px; font-weight: 800; color: #c62828;">${fmtINR(totalPending)}</div>
        </div>
        <div style="flex: 1; background: #fff8e1; border: 1px solid #ffe082; padding: 8px; border-radius: 4px;">
          <div style="font-size: 8px; text-transform: uppercase; color: #f9a825; font-weight: 700;"> Bottles Due</div>
          <div style="font-size: 14px; font-weight: 800; color: #f9a825;">${bottlesBalance}</div>
        </div>
      </div>

      <!-- LEDGER TABLE -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 10px;">
        <thead>
          <tr style="background: #f4f4f4; border-top: 1px solid #111; border-bottom: 1px solid #111;">
            <th style="padding: 6px; width: 8%;">Date</th>
            <th style="padding: 6px; width: 30%;">Items</th>
            <th style="padding: 6px; text-align: right; width: 12%;">Amount</th>
            <th style="padding: 6px; text-align: right; width: 12%;">Paid</th>
            <th style="padding: 6px; text-align: right; width: 12%;">Balance</th>
            <th style="padding: 6px; text-align: center; width: 8%;">Bottles</th>
            <th style="padding: 6px; text-align: center; width: 8%;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${ledgerOrders.map((o) => {
            const total = Number(o.total) || orderTotal(o.items || []);
            // Prefer customAmount over raw amountPaid
            const paid =
              o.customAmount !== undefined && o.customAmount !== null
                ? Number(o.customAmount) || 0
                : o.paymentStatus === "Paid"
                  ? total
                  : Number(o.amountPaid) || 0;
            const cumBal = balanceMap[o.id] || 0;
            const milkQty = (o.items || [])
              .filter((it) => it.category === "Milk")
              .reduce((s, it) => s + (Number(it.qty) || 0), 0);
            const returned = Number(o.bottlesReturned) || 0;
            const bottleNet = Math.max(0, milkQty - returned);

            const itemsStr = (o.items || [])
              .map((it) => `${it.qty}×${it.productName || it.name}`)
              .join(", ");

            return `
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 5px;">${fmtDateShort(o.orderDate)}</td>
                <td style="padding: 5px; font-weight: 600;">${itemsStr || "—"}</td>
                <td style="padding: 5px; text-align: right;">${fmtINR(total)}</td>
                <td style="padding: 5px; text-align: right; color: #2e7d32;">${fmtINR(paid)}</td>
                <td style="padding: 5px; text-align: right; font-weight: 600; color: ${cumBal > 0 ? "#c62828" : "#2e7d32"};">
                  ${fmtINR(cumBal)}
                </td>
                <td style="padding: 5px; text-align: center;">${bottleNet}</td>
                <td style="padding: 5px; text-align: center;">
                  <span style="
                    font-size: 8px;
                    font-weight: 700;
                    padding: 2px 5px;
                    border-radius: 4px;
                    background: ${o.orderStatus === "Delivered" ? "#e8f5e9" : "#fff3e0"};
                    color: ${o.orderStatus === "Delivered" ? "#2e7d32" : "#ef6c00"};
                  ">${o.orderStatus}</span>
                </td>
              </tr>
            `;
          }).join("")}

          <!-- TOTALS ROW -->
          <tr style="border-top: 2px solid #111; font-weight: 700; background: #fafafa;">
            <td colspan="2" style="padding: 6px; text-align: right;">TOTALS</td>
            <td style="padding: 6px; text-align: right;">${fmtINR(totalSales)}</td>
            <td style="padding: 6px; text-align: right; color: #2e7d32;">${fmtINR(totalPaid)}</td>
            <td style="padding: 6px; text-align: right; color: #c62828;">${fmtINR(totalPending)}</td>
            <td style="padding: 6px; text-align: center;">${bottlesBalance}</td>
            <td style="padding: 6px;"></td>
          </tr>
        </tbody>
      </table>

      <!-- OUTSTANDING NOTICE -->
      <div style="
        background: ${totalPending > 0 ? "#fff5f5" : "#f0f7f0"};
        border: 1px solid ${totalPending > 0 ? "#ffcdd2" : "#c8e6c9"};
        padding: 10px;
        border-radius: 4px;
        font-size: 11px;
        margin-bottom: 14px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      ">
        <div>
          <b style="color: ${totalPending > 0 ? "#c62828" : "#2e7d32"};">
            ${totalPending > 0 ? "⚠️ Amount Due" : "✅ Account Clear"}
          </b>
          <div style="color: #555; margin-top: 2px;">
            ${totalPending > 0 
              ? `Please settle the outstanding balance of ${fmtINR(totalPending)} to continue uninterrupted service.` 
              : "No outstanding payments for this month."}
          </div>
        </div>
        <div style="
          font-size: 18px;
          font-weight: 800;
          color: ${totalPending > 0 ? "#c62828" : "#2e7d32"};
        ">${fmtINR(totalPending)}</div>
      </div>

      <!-- FOOTER -->
      <div style="
        text-align: center;
        border-top: 1px solid #111;
        padding-top: 8px;
        margin-top: 10px;
        font-size: 8px;
        color: #666;
      ">
        <div>Thank you for your business!</div>
        <div style="margin-top: 2px;">${BUSINESS_NAME} | ${BUSINESS_PHONE || ""}</div>
      </div>
    </div>
  `; 
}

/* -------------------------------------------------------------------------- 
   PDF GENERATION 
-------------------------------------------------------------------------- */

export async function generateMonthlyStatementPDF(customer, monthSummary, allOrders) {
  let container = null;
  try {
    // 1. Create container matching DOM rendering strategy
    container = document.createElement("div");
    container.style.position = "relative";
    container.style.width = "703px";
    container.style.minHeight = "auto";
    container.style.margin = "0";
    container.style.padding = "0";
    container.style.background = "#ffffff";
    container.style.pointerEvents = "none";
    container.innerHTML = buildMonthlyStatementMarkup(customer, monthSummary, allOrders);
    document.body.appendChild(container);

    // 2. Wait for fonts and images to load
    await waitForInvoiceRender();
    await waitForInvoiceImages(container);

    // 3. Configure html2pdf options
    const filename = `Statement_${customer?.name || "Customer"}_${monthSummary.monthKey}.pdf`.replace(/\s+/g, "_");
    const opt = {
      margin: [8, 8, 8, 8],
      filename: filename,
      image: { type: "jpeg", quality: 0.98 },
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
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait", compress: true },
      pagebreak: {
        mode: ["avoid-all", "css", "legacy"],
        avoid: ["div", "tr", "img"],
      },
    };

    // 4. Generate PDF output URI
    const pdfDataUri = await html2pdf()
      .set(opt)
      .from(container)
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
          title: "Monthly Statement",
          text: `Monthly Statement for ${customer?.name || "Customer"} (${monthSummary.monthKey})`,
          url: file.uri,
          dialogTitle: "Share Statement PDF",
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
  } catch (error) {
    console.error("Error generating monthly statement PDF:", error);
    alert(error?.message || "Failed to generate monthly statement PDF.");
  } finally {
    // 6. Clean up the temporary DOM element
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
  }
}