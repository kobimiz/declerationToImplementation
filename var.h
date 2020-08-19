#ifndef VAR_H
#define VAR_H

#include "expression.h"

class Var: public Expression {
private:
    const char name;
public:
    Var(char name);

    int x();
};

#endif