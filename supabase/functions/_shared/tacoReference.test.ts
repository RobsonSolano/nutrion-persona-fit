import { describe, it, expect } from 'vitest';
import { TACO_ALIMENTOS, formatTacoForPrompt } from './tacoReference';

describe('TACO_ALIMENTOS', () => {
  it('SAN-08: subconjunto enxuto (45-70), não a tabela toda', () => {
    // O bloco entra em TODA chamada do sanity check, então o custo de token é
    // recorrente e pressiona o TPM do Groq. A lista foi cortada de 75 para ~52
    // priorizando onde a inflação nasce (grão, massa, carne, óleo); fruta e
    // folha ficaram com as mais frequentes, porque não têm armadilha de
    // preparo e o modelo já as estima razoavelmente.
    expect(TACO_ALIMENTOS.length).toBeGreaterThanOrEqual(45);
    expect(TACO_ALIMENTOS.length).toBeLessThanOrEqual(70);
  });

  it('SAN-08: todo item tem nome e kcal plausível por 100 g', () => {
    for (const a of TACO_ALIMENTOS) {
      expect(a.nome.trim().length).toBeGreaterThan(3);
      expect(a.kcal).toBeGreaterThan(0);
      // Nada supera gordura pura (~900 kcal/100 g).
      expect(a.kcal).toBeLessThanOrEqual(900);
      expect(a.prot).toBeGreaterThanOrEqual(0);
      expect(a.carb).toBeGreaterThanOrEqual(0);
      expect(a.gord).toBeGreaterThanOrEqual(0);
    }
  });

  it('SAN-09: nenhum grão, massa ou leguminosa entra na forma CRUA', () => {
    // Guarda-corpo da armadilha central: arroz/feijão/macarrão crus têm 3-5x
    // mais kcal/100 g que cozidos. Oferecer o valor cru ao modelo seria criar
    // exatamente o erro que esta feature existe para corrigir.
    const proibidos = TACO_ALIMENTOS.filter((a) => {
      const n = a.nome.toLowerCase();
      const ehGraoOuMassa =
        n.includes('arroz') || n.includes('feijão') || n.includes('macarrão') ||
        n.includes('lentilha') || n.includes('grão-de-bico') || n.includes('batata');
      return ehGraoOuMassa && (n.includes('cru') || n.includes('crua'));
    });

    expect(proibidos.map((a) => a.nome)).toEqual([]);
  });

  it('SAN-08: valores conferem com a TACO para os casos que ancoram a feature', () => {
    const acha = (t: string) => TACO_ALIMENTOS.find((a) => a.nome.startsWith(t));

    expect(acha('Arroz, integral, cozido')?.kcal).toBe(124);
    expect(acha('Feijão, carioca, cozido')?.kcal).toBe(76);
    expect(acha('Feijão, preto, cozido')?.kcal).toBe(77);
    expect(acha('Frango, peito sem pele, grelhado')?.kcal).toBe(159);
    // óleo/azeite: erro aqui é caro (884 kcal/100 g)
    expect(acha('Azeite de oliva')?.kcal).toBe(884);
  });

  it('SAN-08: kcal é coerente com os macros (pega transposição de dígito)', () => {
    // Atwater: kcal ≈ 4·prot + 4·carb + 9·gord. A tolerância de 25% vem de
    // medição, não de chute: a auditoria cruzada mostrou que o pior caso real
    // é -19,4% (folhas, onde fibra e ácidos orgânicos pesam proporcionalmente
    // mais num kcal absoluto pequeno). Acima disso indica dígito trocado ou
    // coluna invertida.
    for (const a of TACO_ALIMENTOS) {
      const calculado = a.prot * 4 + a.carb * 4 + a.gord * 9;
      if (calculado === 0) continue; // refrigerante diet e afins
      const desvio = Math.abs(a.kcal - calculado) / calculado;
      expect(desvio, `${a.nome}: ${a.kcal} kcal vs ${calculado.toFixed(0)} calculado`)
        .toBeLessThan(0.25);
    }
  });

  it('não há nome duplicado', () => {
    const nomes = TACO_ALIMENTOS.map((a) => a.nome);
    expect(new Set(nomes).size).toBe(nomes.length);
  });
});

describe('formatTacoForPrompt', () => {
  it('SAN-09: o bloco instrui explicitamente a usar a forma preparada, não a crua', () => {
    const bloco = formatTacoForPrompt().toLowerCase();

    expect(bloco).toContain('cozido');
    expect(bloco).toContain('cru');
    expect(bloco).toMatch(/3 a 5|3-5/);
  });

  it('SAN-08: lista os alimentos com kcal e macros, e credita a fonte', () => {
    const bloco = formatTacoForPrompt();

    expect(bloco).toContain('Arroz, integral, cozido');
    expect(bloco).toContain('124');
    expect(bloco).toMatch(/TACO/);
    expect(bloco).toMatch(/UNICAMP|NEPA/);
  });

  it('SAN-08: TODOS os alimentos aparecem no bloco (um .slice() futuro não passa)', () => {
    const bloco = formatTacoForPrompt();

    for (const a of TACO_ALIMENTOS) {
      expect(bloco).toContain(a.nome);
      expect(bloco).toContain(String(a.kcal));
    }
  });

  it('cabe num orçamento de prompt razoável (< 6000 caracteres)', () => {
    expect(formatTacoForPrompt().length).toBeLessThan(6000);
  });
});
