import { Router, Request, Response, raw } from "express";
import Stripe from "stripe";
import { validateEnv } from "../../../../config/validateEnv";
import Creator from "./creator.model";
import Logging from "../../../library/logging";
import { StripeAccountStatus } from "./creator.interface";
import PaidRoom from "../../room/paidRooms/paidRoom.model";
import { createEntryQRCode } from "../../room/room.service";
import { recordTicketPurchase } from "../../room/paidRooms/paidRoom.service";

const stripeApiKey = validateEnv.STRIPE_SECRET_KEY;
if (!stripeApiKey) {
  throw new Error("Missing STRIPE_SECRET_KEY.");
}

const stripe = new Stripe(stripeApiKey, { apiVersion: "2025-11-17.clover" });

const router = Router();

router.post("/stripe/webhook", raw({type: 'application/json'}), async (req: Request, res: Response) => {
  const sig = req.headers["stripe-signature"] as string;
  console.log("sig: ", typeof sig, sig)
  const endpointSecret = validateEnv.STRIPE_WEBHOOK_SECRET;

  let event: Stripe.Event;
  
  console.log("req.body:", req.body, typeof req.body);

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err: any) {
    Logging.error(`Webhook signature verification failed: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case "account.updated":
        await handleAccountUpdated(event.data.object as Stripe.Account);
        break;
      case "capability.updated":
        await handleCapabilityUpdated(event.data.object as Stripe.Capability);
        break;
      default:
        Logging.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error: any) {
    Logging.error(`Webhook handler error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

export async function stripeWebhookHandler(req: Request, res: Response) {
  const sig = req.headers["stripe-signature"] as string;
  // console.log("stripe-signature header:", sig);
  // console.log("raw body length:", (req.body as Buffer).length);
  // console.log("first 200 bytes of raw body:", (req.body as Buffer).toString());
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event: Stripe.Event;
  
  console.log("req.body:", req.body, typeof req.body);

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret!);
  } catch (err: any) {
    Logging.error(`Webhook signature verification failed: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case "account.updated":
        await handleAccountUpdated(event.data.object as Stripe.Account);
        break;
      case "capability.updated":
        await handleCapabilityUpdated(event.data.object as Stripe.Capability);
        break;
      default:
        Logging.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error: any) {
    Logging.error(`Webhook handler error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
}

async function handleAccountUpdated(account: Stripe.Account) {
  try {
    const creator = await Creator.findOne({ stripeConnectAccountId: account.id });
    if (!creator) {
      Logging.log(`No creator found for Stripe account: ${account.id}`);
      return;
    }

    const isReady = (
      account.details_submitted === true &&
      account.charges_enabled === true &&
      account.payouts_enabled === true &&
      account.capabilities?.card_payments === "active" &&
      account.capabilities?.transfers === "active"
    );

    const newStatus = isReady ? StripeAccountStatus.ACTIVE : StripeAccountStatus.PENDING;

    if (creator.stripeAccountStatus !== newStatus) {
      await Creator.findByIdAndUpdate(creator._id, {
        stripeAccountStatus: newStatus,
      });

      Logging.log(`Creator ${creator._id} Stripe status updated to: ${newStatus}`);
    }
  } catch (error: any) {
    Logging.error(`Handle account updated error: ${error.message}`);
  }
}

async function handleCapabilityUpdated(capability: Stripe.Capability) {
  try {
    const accountId = capability.account as string;
    const creator = await Creator.findOne({ stripeConnectAccountId: accountId });
    if (!creator) {
      Logging.log(`No creator found for Stripe account: ${accountId}`);
      return;
    }

    const account = await stripe.accounts.retrieve(accountId);
    const isReady = (
      account.details_submitted === true &&
      account.charges_enabled === true &&
      account.payouts_enabled === true &&
      account.capabilities?.card_payments === "active" &&
      account.capabilities?.transfers === "active"
    );

    const newStatus = isReady ? StripeAccountStatus.ACTIVE : StripeAccountStatus.PENDING;

    if (creator.stripeAccountStatus !== newStatus) {
      await Creator.findByIdAndUpdate(creator._id, {
        stripeAccountStatus: newStatus,
      });

      Logging.log(`Creator ${creator._id} Stripe status updated to: ${newStatus} after capability update`);
    }
  } catch (error: any) {
    Logging.error(`Handle capability updated error: ${error.message}`);
  }
}

export default router;

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  try {
    console.log("completing checkout started...")
    const metadata = (session.metadata || {}) as Record<string, string>;
    const roomId = metadata.roomId;
    const userId = metadata.userId;
    const tierTitle = metadata.tierTitle;
    const quantity = parseInt(metadata.quantity || "1", 10);
    const amountTotal = session.amount_total || 0;

    if (!roomId || !userId) return;

    await recordTicketPurchase(
        roomId,
        userId,
        tierTitle,
        quantity,
        (typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id) || session.id,
        amountTotal
    );

    console.log("checkout completed...")
    // Generate QR (Keep your existing QR logic)
    try {
      console.log("generating QR code...")
      const ticketId = `ticket_${session.id}_${Date.now()}`;
      await createEntryQRCode(roomId, userId, ticketId);
      Logging.log(`Entry QR code generated for user ${userId}`);
    } catch (qrError: any) {
      console.log("error in qr code...")
      Logging.error(`Entry QR code generation error: ${qrError.message}`);
    }

  } catch (error: any) {
    console.log("error in checkout complete")
    Logging.error(`Checkout fulfillment error: ${error.message}`);
  }
}







