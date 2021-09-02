#include <iostream>

using namespace std;

void printInt(int a)
{
    cout << "value: " << a << endl;
}

char get_char(int i)
{
    switch (i) {
        case 10:
            return 'a';
        case 11:
            return 'f';
        case 12:
            return 't';
        case 13:
            return 'e';
        case 14:
            return 'r';
        case 15:
            return '!';
        default:
            return '\n';
    }
}

int main()
{
    int i, j;
    char single_char[] = {'b', 'e', 'f', 'o', 'r', 'e'};
    for (i = 10; i < 20; i++) {
        j += 5;
        if (i >= 10 && i <= 15)
        {
            single_char[i-10] = get_char(i);
        }
        printInt(j);
    }
    return 0;
}
