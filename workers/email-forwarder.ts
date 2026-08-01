export interface EmailForwardingEnv {
  EMAIL_FORWARD_PRIMARY?: string;
  EMAIL_FORWARD_SECONDARY?: string;
}

export interface ForwardableEmail {
  forward(recipient: string): Promise<unknown>;
  setReject(reason: string): void;
}

export function forwardingDestinations(env: EmailForwardingEnv) {
  return [...new Set([env.EMAIL_FORWARD_PRIMARY, env.EMAIL_FORWARD_SECONDARY]
    .map((address) => address?.trim().toLocaleLowerCase("en-US"))
    .filter((address): address is string => Boolean(address)))];
}

export default {
  async email(message: ForwardableEmail, env: EmailForwardingEnv) {
    const destinations = forwardingDestinations(env);
    if (destinations.length !== 2) {
      message.setReject("Email forwarding destinations are not configured.");
      return;
    }

    await Promise.all(destinations.map((destination) => message.forward(destination)));
  },
};
