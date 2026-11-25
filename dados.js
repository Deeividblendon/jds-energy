/* Tabela de preços médios de serviços elétricos 2026 (só mão de obra).
   Formato: nome|mínimo|máximo|médio|unidade|observação. O id do serviço é categoria + posição: só acrescente linhas no fim de cada categoria. */
const TABELA = `
#ilu|Iluminação
Instalação de interruptor simples ou pulsador|55|80|68
Instalação de interruptor three-way ou four-way|70|90|80
Instalação de interruptor duplo ou bipolar|70|90|80
Instalação de interruptor e tomada (juntos)|70|90|80
Instalação de arandela, pendente ou spot comum|75|110|93
Instalação de lâmpada fluorescente ou LED (tubular)|80|105|93
Instalação de lustre simples ou luminária|105|135|120
Instalação de lustre grande ou luminária|160|200|180
Instalação de refletor de jardim|115|150|133
Instalação de refletor de poste comum|145|200|173
Instalação de refletor de poste com lâmpada a vapor|145|200|173
Instalação de reator de lâmpada a vapor|90|120|105.5
Instalação de fotocélula ou sensor de presença|90|140|115
Instalação de refletor LED + fotocélula ou sensor de presença|80|130|105
Instalação de luminária de emergência de sobrepor|90|140|115
Instalação de luminária de emergência de embutir (caixinha 2x4)|70|105|88
Instalação de perfil de LED (metro linear)|180|230|205|m
Instalação de luminária tubular ou troca de reator por LED|90|130|110
#uso|Ponto de utilização
Instalação de tomada simples|45|70|58
Instalação de tomada dupla|55|80|68
Instalação de tomada tripla|70|90|80
Instalação de tomada de piso e/ou telefone|70|90|80
Instalação de tomada industrial (3P+T)|105|150|128
Instalação de tomada de sobrepor com canaleta|70|90|80
Instalação de chave de boia superior e inferior (em residência)|135|175|155
Instalação de ventilador de teto|160|200|180
Instalação de ventilador de parede|105|125|115
Instalação de chuveiro elétrico simples|105|125|115
Instalação de chuveiro luxo (eletrônico, pressurizado ou ducha)|160|180|170
Troca de resistência de chuveiro (elétrico ou eletrônico)|90|115|103
Instalação de torneira elétrica|105|120|113
Instalação de campainha até 20 m|80|100|90
Instalação de interfone, 1 chamada|170|230|200
Instalação de interfone, 2 chamadas|170|220|195|un|A tabela traz mínimo 220 e máximo 170, invertidos. Aqui está de 170 a 220, com a média original de 195.
Instalação de interfone, 4 chamadas|480|550|515
Instalação de vídeo porteiro|205|230|218
Instalação de CFTV, 1 câmera Wi-Fi (sem ponto elétrico)|170|210|190
Instalação de CFTV, 3 câmeras Wi-Fi (sem ponto elétrico)|410|450|430
Instalação de portão eletrônico deslizante|300|350|325
Instalação de portão eletrônico pivotante e/ou basculante|560|610|585
Instalação de botoeira para fechadura eletrônica (portão social)|70|100|85
Instalação de fechadura eletrônica (portão social)|170|200|185
Instalação de exaustor de cozinha ou banheiro|260|300|280
Instalação de sistema de alarme residencial|900|1200|1050
Instalação de aquecedor elétrico (com passagem de cabos)|2330|3200|2765
Instalação de detector de fumaça|1290|1800|1545|un|Depende das dificuldades, da altura e da distância do local.
Instalação de cerca elétrica (por metro de cerca)|70|110|90|m
Instalação de nobreak|325|360|343
Instalação de aquecedor a gás|350|450|400
Instalação de termostato ou temporizador|105|150|128
#qdc|Quadros de distribuição
Substituição de disjuntor monofásico|60|80|70
Substituição de disjuntor bifásico|80|100|90
Substituição de disjuntor trifásico|120|130|125|un|A tabela traz média de 115, abaixo do mínimo de 120. Aqui está 125, o meio da faixa. Confira.
Instalação de IDR (interruptor diferencial residual)|150|170|160
Instalação de DPS (dispositivo de proteção contra surtos)|120|140|130
Instalação de barramento pente monopolar no QDC|70|90|80
Instalação de barramento pente bipolar no QDC|80|100|90
Instalação de barramento pente tripolar no QDC|90|110|100
Instalação de barramento de neutro e/ou terra|100|120|110
Instalação de haste de aterramento|250|500|350
Instalação de contator e/ou relé térmico|200|250|230
Instalação e montagem de QDC (6 circuitos + DR + DPS)|650|800|725
Instalação e montagem de QDC (12 circuitos + DR + DPS)|850|1000|925
Instalação e montagem de QDC (18 circuitos + DR + DPS)|1000|1500|1250
Instalação e montagem de QDC (24 circuitos + DR + DPS)|1500|3000|2300
#cab|Passagem de cabos (até 20 m)
Entrada monofásica (QM para QDC)|220|250|230
Entrada bifásica ou trifásica (QM para QDC)|250|300|280
Alimentação para motores|300|350|325
#def|Solução de problemas
Curto-circuito monofásico|130|600|400
Curto-circuito bifásico|200|1000|600
Curto-circuito trifásico|300|1200|800
#pad|Padrão de entrada
Instalação de medidor (padrão monofásico 127 V ou 220 V)|1200|1800|1500
Instalação de medidor (padrão bifásico 220 V)|1400|2000|1700
Instalação de medidor (padrão trifásico 220 V)|2000|2500|2250
#vei|Carregador veicular
Instalação de carregador veicular|1200|1800|1500|un|Considera instalação residencial simples. Varia com o carregador, a infraestrutura, a vaga e o reforço na rede.
#aut|Automação residencial
Instalação de interruptor inteligente|150|300|225
Instalação de mini relé interruptor|200|300|250
Instalação de relé de impulso|150|220|175
Instalação de relé dimmer|200|300|250
Instalação e configuração de controle remoto universal|110|150|130
Instalação de tomada inteligente|150|200|175
Instalação de mini relé para controle de persiana|200|300|250
Instalação e configuração de hub|200|250|225
Instalação e configuração de roteador|150|300|225
Instalação e configuração de fechadura inteligente|250|400|325
Instalação e configuração de assistente virtual|200|300|250
`;
const CATS = [], BASE = [];
(() => {
  let cat, n;
  for (const l of TABELA.trim().split("\n")) {
    const p = l.split("|");
    if (l[0] === "#") { cat = p[0].slice(1); n = 0; CATS.push({ id: cat, nome: p[1] }); }
    else BASE.push({ id: cat + (++n), cat, nome: p[0], min: +p[1], max: +p[2], med: +p[3], un: p[4] || "un", nota: p[5] || "" });
  }
})();
