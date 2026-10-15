// Traduz mensagens de erro do serviço de autenticação para português.
export function traduzirErroAuth(msg: string, code?: string): string {
  const m = msg || "";
  if (code === "over_email_send_rate_limit" || /rate limit/i.test(m))
    return "Limite de envios de e-mail atingido. Aguarde alguns minutos e tente novamente.";
  const seg = m.match(/after (\d+) seconds?/i);
  if (seg) return `Por segurança, aguarde ${seg[1]} segundos antes de pedir outro link.`;
  if (/invalid login/i.test(m)) return "E-mail ou senha incorretos.";
  if (/email not confirmed/i.test(m)) return "E-mail ainda não confirmado. Verifique sua caixa de entrada.";
  if (/already registered/i.test(m)) return "Este e-mail já tem conta. Use a aba Entrar.";
  if (/invalid.*email|email.*invalid/i.test(m)) return "E-mail inválido.";
  if (/different from the old password/i.test(m)) return "A nova senha deve ser diferente da senha anterior.";
  if (/password/i.test(m) && /(weak|pwned|leaked|characters|at least)/i.test(m))
    return "Senha fraca ou vazada. Use pelo menos 8 caracteres e uma senha única.";
  if (/auth session missing|session.*(expired|not found)/i.test(m))
    return "Sua sessão de recuperação expirou. Peça um novo link.";
  if (/expired|invalid.*(token|link|otp)|otp/i.test(m)) return "O link expirou ou é inválido. Peça um novo link.";
  if (/failed to fetch|network/i.test(m)) return "Falha de conexão. Verifique a internet e tente novamente.";
  return `Erro: ${m}`;
}
